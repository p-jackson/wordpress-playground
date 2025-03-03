import { loadNodeRuntime } from '@php-wasm/node';
import { PHP } from '@php-wasm/universal';
import { RecommendedPHPVersion } from '@wp-playground/common';
import { getWordPressModule } from '@wp-playground/wordpress-builds';
import { unzip } from './unzip';
import { activateTheme } from './activate-theme';
import { phpVar } from '@php-wasm/util';
import { PHPRequestHandler } from '@php-wasm/universal';

describe('Blueprint step activateTheme()', () => {
	let php: PHP;
	let handler: PHPRequestHandler;
	beforeEach(async () => {
		handler = new PHPRequestHandler({
			phpFactory: async () =>
				new PHP(await loadNodeRuntime(RecommendedPHPVersion)),
			documentRoot: '/wordpress',
		});
		php = await handler.getPrimaryPhp();
		php.mkdir('/wordpress');
		await unzip(php, {
			zipFile: await getWordPressModule(),
			extractToPath: '/wordpress',
		});
	});

	it('should activate the theme', async () => {
		const docroot = php.documentRoot;
		php.mkdir(`${docroot}/wp-content/themes/test-theme`);
		php.writeFile(
			`${docroot}/wp-content/themes/test-theme/style.css`,
			`/**
* Theme Name: Test Theme
* Theme URI: https://example.com/test-theme
* Author: Test Author
*/
			`
		);
		await activateTheme(php, {
			themeFolderName: 'test-theme',
		});

		const response = await php.run({
			code: `<?php
				require '/wordpress/wp-load.php';
				echo wp_get_theme()->get('Name');
			`,
		});
		expect(response.text).toBe('Test Theme');
	});

	it('should run the activation hooks as a priviliged user', async () => {
		const docroot = php.documentRoot;
		const createdFilePath =
			docroot + '/activation-ran-as-a-priviliged-user.txt';

		const themeDir = `${docroot}/wp-content/themes/test-theme`;
		php.mkdir(`${themeDir}/test-theme`);
		php.writeFile(
			`${themeDir}/style.css`,
			`/**
* Theme Name: Test Theme
* Theme URI: https://example.com/test-theme
*/`
		);
		php.writeFile(
			`${docroot}/wp-content/mu-plugins/0-on-theme-switch.php`,
			`<?php
			file_put_contents( ${phpVar(createdFilePath)}, 'Hello World');
			function mytheme_activate() {
				if( ! current_user_can( 'activate_plugins' ) ) {
					return;
				}
				file_put_contents( ${phpVar(createdFilePath)}, 'Hello World' );
			}
			add_action( 'after_switch_theme', 'mytheme_activate' );
			`
		);
		await activateTheme(php, {
			themeFolderName: 'test-theme',
		});

		expect(php.fileExists(createdFilePath)).toBe(true);
	});

	it('should detect a silent failure in activating the theme', async () => {
		const docroot = php.documentRoot;
		php.mkdir(`${docroot}/wp-content/themes/test-theme`);
		php.writeFile(
			`${docroot}/wp-content/themes/test-theme/style.css`,
			`/**
* Theme Name: Test Theme
* Theme URI: https://example.com/test-theme
* Author: Test Author
*/
			`
		);
		php.writeFile(
			`/${docroot}/wp-content/mu-plugins/0-exit.php`,
			`<?php exit(0); `
		);
		expect(
			async () =>
				await activateTheme(php, {
					themeFolderName: 'test-theme',
				})
		).rejects.toThrow(/Theme test-theme could not be activated/);
	});
});
