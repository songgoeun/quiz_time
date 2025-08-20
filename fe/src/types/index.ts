export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
}

export interface Room {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  gameStarted: boolean;
  players?: Player[];
  host?: string;
}

export interface GameRoom extends Room {
  players: Player[];
  host: string;
  gamePhase?: "waiting" | "categorySelection" | "playing" | "finished";
  selectedCategory?: {
    id: number;
    name: string;
    description: string;
  };
  currentQuestionIndex?: number;
  playerScores?: { [playerId: string]: number };
}

export interface QuizQuestion {
  questionNumber: number;
  totalQuestions: number;
  question: string;
  options: string[];
  difficulty: string;
  timeLimit: number;
}

export interface QuestionResult {
  correctAnswer: string;
  explanation: string;
  playerResults: Array<{
    playerId?: string;
    nickname: string;
    answer: string;
    isCorrect: boolean;
    timeSpent: number;
    score: number;
  }>;
}

export interface FinalScore {
  nickname: string;
  score: number;
  rank?: number;
}

export interface Category {
  id: number;
  name: string;
  description: string;
  emoji: string;
}

export const QUIZ_CATEGORIES: Category[] = [
  {
    id: 1,
    name: "다슬쨩의 애니",
    description: "애니메이션 관련 퀴즈",
    emoji: "🎌",
  },
  {
    id: 2,
    name: "윤하캐리 한국사",
    description: "한국사 관련 퀴즈",
    emoji: "🏛️",
  },
  {
    id: 3,
    name: "몰상식 듀오의 상식",
    description: "일반상식 관련 퀴즈",
    emoji: "🧠",
  },
];
