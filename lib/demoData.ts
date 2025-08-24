import type { Topic } from './types';

export const demoTopics: Topic[] = [
  {
    id: 'tides',
    title: 'Why the tides rise and fall',
    blurb: 'A short tour of gravity, the moon, and coastal rhythms.',
    domain: 'Science',
    difficulty: 'Beginner',
    angles: ['Moon vs sun influence', 'Spring vs neap tides', 'Real-world safety tips'],
    seedContext: 'We will explore the physics and daily patterns of tides.'
  },
  {
    id: 'maps',
    title: 'How maps distort the world',
    blurb: 'Projections, tradeoffs, and what distances really mean.',
    domain: 'Ideas',
    difficulty: 'Intermediate',
    angles: ['Mercator vs equal-area', 'Navigation history', 'Modern GIS'],
    seedContext: 'Compare map projections and why no map is perfect.'
  },
  {
    id: 'roman-legions',
    title: 'Inside a Roman legion',
    blurb: 'Organization, training, and battle tactics of Rome’s army.',
    domain: 'History',
    difficulty: 'Advanced',
    angles: ['Maniples to cohorts', 'Logistics', 'Legacy in modern doctrine'],
    seedContext: 'From the Republic to the Empire, legions shaped history.'
  }
];
