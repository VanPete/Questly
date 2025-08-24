export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';
export type Domain =
  | 'People'
  | 'Places'
  | 'Ideas'
  | 'History'
  | 'Math'
  | 'Military History'
  | 'Science';

export type Topic = {
  id: string;
  title: string;
  blurb: string;
  domain: Domain;
  difficulty: Difficulty;
  angles: string[];
  seedContext?: string | null;
};

export type ChatTurn = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};
