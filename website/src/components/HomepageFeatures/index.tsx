import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  emoji: string;
  description: ReactNode;
};

// Minimal, on-brand home cards (T1). The full landing/IA lands in T2.
const FeatureList: FeatureItem[] = [
  {
    title: 'Snapshot',
    emoji: '📸',
    description: (
      <>
        Capture your Claude Code setup — settings, MCP servers, subagents, and
        skills — into a single portable <code>claude-profile.json</code>.
      </>
    ),
  },
  {
    title: 'Scrub',
    emoji: '🧼',
    description: (
      <>
        Secrets are redacted on the way out — secretlint plus heuristics, aware
        of <code>{'${env:VAR}'}</code> placeholders — and the manifest is
        re-scanned before it&apos;s written.
      </>
    ),
  },
  {
    title: 'Migrate',
    emoji: '🚚',
    description: (
      <>
        Carry the profile to another machine and install it with a deep merge
        that preserves your existing configuration.
      </>
    ),
  },
];

function Feature({title, emoji, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <span style={{fontSize: '3rem'}} role="img" aria-label={title}>
          {emoji}
        </span>
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
