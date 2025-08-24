export type MCQ = { q: string; options: string[]; correct_index: number };

export type TopicQuestionSet = {
  quick: MCQ;
  quiz: MCQ[]; // 5
};

export const demoQuestionBank: Record<string, TopicQuestionSet> = {
  tides: {
    quick: {
      q: 'What mainly causes tides on Earth?',
      options: ['Wind patterns', 'Moon’s gravity', 'Earth’s rotation', 'Ocean currents'],
      correct_index: 1,
    },
    quiz: [
      { q: 'High tides are highest during which phase?', options: ['Quarter', 'New/Full (spring)', 'Gibbous', 'Crescent'], correct_index: 1 },
      { q: 'Neap tides occur when the Sun and Moon are...', options: ['Aligned', 'At right angles', 'Both new', 'Both full'], correct_index: 1 },
      { q: 'Which body has the bigger tidal effect?', options: ['Sun', 'Moon', 'They are equal', 'Jupiter'], correct_index: 1 },
      { q: 'How many high tides per day at most coasts?', options: ['1', '2', '3', 'Varies randomly'], correct_index: 1 },
      { q: 'A practical safety tip around tides?', options: ['Ignore forecasts', 'Check local tables', 'Swim at night', 'Tides are the same everywhere'], correct_index: 1 },
    ],
  },
  maps: {
    quick: {
      q: 'Mercator projection preserves...',
      options: ['Area', 'Shape and bearings', 'Distances', 'None of the above'],
      correct_index: 1,
    },
    quiz: [
      { q: 'Equal-area maps preserve...', options: ['Shape', 'Area', 'Bearings', 'Scale everywhere'], correct_index: 1 },
      { q: 'Greenland appears huge on Mercator because...', options: ['It is huge', 'High-latitude stretching', 'Data error', 'Political bias only'], correct_index: 1 },
      { q: 'Which is best for navigation bearings?', options: ['Mercator', 'Equal-area', 'Gnomonic', 'Orthographic'], correct_index: 0 },
      { q: 'No flat map can perfectly preserve...', options: ['Area only', 'Shape only', 'All properties', 'Bearings only'], correct_index: 2 },
      { q: 'Modern GIS often uses...', options: ['Single universal proj', 'Projection per purpose', 'Only 3D globes', 'No projections'], correct_index: 1 },
    ],
  },
  'roman-legions': {
    quick: {
      q: 'A Roman legion was roughly...',
      options: ['500 men', '1,000 men', '5,000 men', '20,000 men'],
      correct_index: 2,
    },
    quiz: [
      { q: 'Early maniples evolved into...', options: ['Cohorts', 'Phalanx', 'Centuries', 'Triarii'], correct_index: 0 },
      { q: 'A centurion was...', options: ['Cavalry officer', 'Infantry commander', 'Quartermaster', 'Auxiliary'], correct_index: 1 },
      { q: 'Key legion strength was...', options: ['Chariots', 'Discipline and logistics', 'Elephants', 'Archers'], correct_index: 1 },
      { q: 'Marching camps provided...', options: ['Festivals', 'Daily fortification', 'Worship', 'None'], correct_index: 1 },
      { q: 'Legacy of legions on modern armies?', options: ['No impact', 'Professionalization', 'Only weapon tech', 'Cavalry focus'], correct_index: 1 },
    ],
  },
};
