import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Overview',
    },
    {
      type: 'doc',
      id: 'installation',
      label: 'Installation',
    },
    {
      type: 'doc',
      id: 'quick-start',
      label: 'Quick Start',
    },
    {
      type: 'doc',
      id: 'basic-usage',
      label: 'Basic Usage',
    },
    {
      type: 'category',
      label: 'API Reference',
      link: { type: 'doc', id: 'api/index' },
      items: [
        'api/props-image',
        'api/props-semantic',
        'api/mask-config',
        'api/pipeline-config',
        'api/paint-config',
        'api/interaction-config',
        'api/ui-controls',
        'api/callbacks',
        'api/ref-methods',
        'api/storage',
      ],
    },
    {
      type: 'doc',
      id: 'interaction-guide',
      label: 'Interaction Guide',
    },
    {
      type: 'category',
      label: 'Integration Examples',
      items: [
        'examples/png-pre-warm',
        'examples/local-paths',
        'examples/draft-recovery',
        'examples/custom-colors',
      ],
    },
    {
      type: 'doc',
      id: 'project-structure',
      label: 'Project Structure',
    },
    {
      type: 'doc',
      id: 'dependencies',
      label: 'Dependencies',
    },
    {
      type: 'doc',
      id: 'performance',
      label: 'Performance',
    },
    {
      type: 'doc',
      id: 'notes',
      label: 'Notes',
    },
    {
      type: 'doc',
      id: 'troubleshooting',
      label: 'Troubleshooting',
    },
  ],
};

export default sidebars;
