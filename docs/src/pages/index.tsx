import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HeroSection() {
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className={styles.heroTitle}>
          🎨 MaskSegmentCanvas
        </Heading>
        <p className={styles.heroSubtitle}>
          React Native Interactive Mask Segmentation
        </p>
        <p className={styles.heroDescription}>
          OpenCV semantic segmentation + SkSL Shader coloring — a powerful
          interactive mask painting library for React Native 0.79+
        </p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/intro">
            Get Started →
          </Link>
          <Link className="button button--outline button--lg" to="/docs/api">
            API Reference
          </Link>
        </div>
      </div>
    </header>
  );
}

function FeatureCard({ emoji, title, description }: { emoji: string; title: string; description: string }) {
  return (
    <div className={clsx('col col--4', styles.featureCard)}>
      <div className={styles.featureEmoji}>{emoji}</div>
      <Heading as="h3" className={styles.featureTitle}>{title}</Heading>
      <p className={styles.featureDesc}>{description}</p>
    </div>
  );
}

function FeaturesSection() {
  const features = [
    {
      emoji: '🧠',
      title: 'OpenCV Segmentation',
      description:
        'Semantic mask layout, baseboard patching, and region extraction powered by react-native-fast-opencv.',
    },
    {
      emoji: '🖌️',
      title: 'Skia SkSL Shader',
      description:
        'Single-pass full-screen shader blending original image + LAB low/high frequency texture color overlays.',
    },
    {
      emoji: '👆',
      title: 'Rich Interaction',
      description:
        'Bottom color bar, tap-to-paint, long-press preview, undo, compare with original, and draft recovery.',
    },
    {
      emoji: '📐',
      title: 'Skia Dash Outlines',
      description:
        'Dashed outline highlights for each semantic region with automatic carousel animation.',
    },
    {
      emoji: '⚡',
      title: 'High Performance',
      description:
        '~320–450ms to interactive on 1080p images. Independent of origin resolution with pipeline capping.',
    },
    {
      emoji: '🌐',
      title: 'Remote & Local Images',
      description:
        'Supports file:// absolute paths and http(s):// remote URLs with built-in download and decode.',
    },
  ];

  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {features.map((feature, idx) => (
            <FeatureCard key={idx} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function QuickStartSection() {
  return (
    <section className={styles.quickStart}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>Quick Start</Heading>
        <div className={styles.codeBlock}>
          <pre>
            <code>{`npm install react-native-mask-segment-canvas

# Install peer dependencies
npm install @shopify/react-native-skia \\
  react-native-reanimated \\
  react-native-fast-opencv \\
  react-native-fs buffer upng-js

# iOS
cd ios && pod install && cd ..`}</code>
          </pre>
        </div>
        <div className={styles.buttons} style={{ marginTop: '1.5rem' }}>
          <Link className="button button--primary button--lg" to="/docs/installation">
            Full Installation Guide
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={`${siteConfig.title} - React Native Mask Segmentation`} description="React Native interactive mask segmentation library with OpenCV semantic segmentation and Skia SkSL Shader coloring.">
      <HeroSection />
      <main>
        <FeaturesSection />
        <QuickStartSection />
      </main>
    </Layout>
  );
}
