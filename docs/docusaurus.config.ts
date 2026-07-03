import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'MaskSegmentCanvas',
  tagline: 'React Native interactive mask segmentation with OpenCV + Skia',
  favicon: 'img/favicon.ico',

  url: 'https://tonychan-hub.github.io',
  baseUrl: '/react-native-mask-segment-canvas/',
  organizationName: 'TonyChan-hub',
  projectName: 'react-native-mask-segment-canvas',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN'],
    localeConfigs: {
      en: { label: 'English' },
      'zh-CN': { label: '简体中文' },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/TonyChan-hub/react-native-mask-segment-canvas/tree/main/docs/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/og-image.png',
    navbar: {
      title: 'MaskSegmentCanvas',
      logo: {
        alt: 'MaskSegmentCanvas Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: 'docs/api',
          label: 'API',
          position: 'left',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/TonyChan-hub/react-native-mask-segment-canvas',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://www.npmjs.com/package/react-native-mask-segment-canvas',
          label: 'npm',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Overview', to: 'docs/intro' },
            { label: 'Installation', to: 'docs/installation' },
            { label: 'Basic Usage', to: 'docs/basic-usage' },
            { label: 'API Reference', to: 'docs/api' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'GitHub', href: 'https://github.com/TonyChan-hub/react-native-mask-segment-canvas' },
            { label: 'npm', href: 'https://www.npmjs.com/package/react-native-mask-segment-canvas' },
          ],
        },
        {
          title: 'More',
          items: [
            { label: 'Performance', to: 'docs/performance' },
            { label: 'Troubleshooting', to: 'docs/troubleshooting' },
            { label: 'Example Project', to: 'docs/project-structure' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} MaskSegmentCanvas. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript'],
    },
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
