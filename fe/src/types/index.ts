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
    name: "모두의 한국사",
    description: "한국사 관련 퀴즈",
    emoji: "🏛️",
  },
  {
    id: 3,
    name: "몰상식 듀오의 상식",
    description: "일반상식 관련 퀴즈",
    emoji: "🧠",
  },
  {
    id: 4,
    name: "윤하의 수학 교실",
    description: "수학 관련 퀴즈",
    emoji: "📐",
  },
];
