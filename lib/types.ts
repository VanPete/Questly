export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';
export type Domain =
  | 'People'
  | 'Places'
  | 'Ideas'
  | 'History'
  | 'Military History'
  | 'Math'
  | 'Science'
  | 'Technology'
  | 'Arts & Culture'
  | 'Nature & Environment'
  | 'Economics & Business'
  | 'Languages & Communication'
  | (string & {});

export type Topic = {
  id: string;
  title: string;
  blurb: string;
  domain: Domain;
  difficulty: Difficulty;
  angles: string[];
  seedContext?: string | null;
  tags?: string[];
  created_at?: string | null;
};

export type ChatTurn = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type Conversation = {
  id: string;
  user_id: string;
  topic_id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  created_at?: string;
};
