const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);

// CORS 설정
app.use(
  cors({
    origin: process.env.FRONTEND_URL || [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://10.13.100.42:5173",
    ],
    credentials: true,
  })
);

app.use(express.json());

const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://10.13.100.42:5173",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// 퀴즈 데이터 로드
const quizData = {};
const loadQuizData = () => {
  const dataDir = path.join(__dirname, "data");
  const categories = [
    { id: 1, file: "anime.json" },
    { id: 2, file: "korean-history.json" },
    { id: 3, file: "general-knowledge.json" },
    { id: 4, file: "math.json" },
  ];

  categories.forEach((category) => {
    try {
      const filePath = path.join(dataDir, category.file);
      if (fs.existsSync(filePath)) {
        // BOM 제거 및 파싱
        const raw = fs.readFileSync(filePath, "utf8");
        const cleaned = raw.replace(/^\uFEFF/, "");
        const parsed = JSON.parse(cleaned);

        // 데이터 정규화: 배열 또는 { questions: [] } 모두 지원
        let normalized;
        if (Array.isArray(parsed)) {
          normalized = {
            category: path.basename(category.file, ".json"),
            category_name: path.basename(category.file, ".json"),
            questions: parsed,
          };
        } else if (parsed && Array.isArray(parsed.questions)) {
          normalized = parsed;
        } else {
          throw new Error("Invalid quiz data format: questions array missing");
        }

        quizData[category.id] = normalized;
        console.log(
          `✅ 퀴즈 데이터 로드됨: ${
            normalized.category_name || category.file
          } (${normalized.questions.length}문제)`
        );
      }
    } catch (error) {
      console.error(
        `❌ 퀴즈 데이터 로드 실패: ${category.file}`,
        error.message
      );
    }
  });
};

// 서버 시작 시 퀴즈 데이터 로드
loadQuizData();

// 게임 상태 저장
const rooms = new Map(); // roomId -> { name, host, players, gameStarted }
const userSockets = new Map(); // socketId -> { nickname, roomId }
// 방별 사용된 문제 ID 저장: roomId -> Map(categoryId -> Set(questionId))
const usedQuestionsByRoom = new Map();

// 방 목록 브로드캐스트 (전역)
function broadcastRoomList() {
  const roomList = Array.from(rooms.entries()).map(([id, room]) => ({
    id,
    name: room.name,
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers,
    gameStarted: room.gameStarted,
  }));
  io.emit("roomListUpdated", roomList);
}

// 기본 라우트
app.get("/", (req, res) => {
  res.json({ message: "Quiz Chat Bot Server is running!" });
});

// 방 정보 조회 API
app.get("/api/rooms", (req, res) => {
  const roomList = Array.from(rooms.entries()).map(([id, room]) => ({
    id,
    name: room.name,
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers,
    gameStarted: room.gameStarted,
  }));
  res.json(roomList);
});

// 서버 상태 확인 API
app.get("/api/status", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    activeRooms: rooms.size,
    connectedUsers: userSockets.size,
  });
});

io.on("connection", (socket) => {
  console.log("사용자 연결:", socket.id);

  // 닉네임 설정
  socket.on("setNickname", (nickname) => {
    if (!nickname || nickname.trim().length < 2) {
      socket.emit("error", "닉네임은 2글자 이상 입력해주세요.");
      return;
    }

    userSockets.set(socket.id, { nickname: nickname.trim(), roomId: null });
    socket.emit("nicknameSet", { success: true, nickname: nickname.trim() });
    console.log(`사용자 ${socket.id}가 닉네임을 ${nickname}으로 설정했습니다.`);
  });

  // 방 만들기
  socket.on("createRoom", (roomName) => {
    const user = userSockets.get(socket.id);
    if (!user) {
      socket.emit("error", "닉네임을 먼저 설정해주세요.");
      return;
    }

    if (!roomName || roomName.trim().length < 2) {
      socket.emit("error", "방 이름은 2글자 이상 입력해주세요.");
      return;
    }

    const roomId = generateRoomId();
    const room = {
      id: roomId,
      name: roomName.trim(),
      host: socket.id,
      players: [
        {
          id: socket.id,
          nickname: user.nickname,
          isHost: true,
        },
      ],
      gameStarted: false,
      gamePhase: "waiting", // waiting, categorySelection, playing, finished
      selectedCategory: null,
      maxPlayers: 8,
      createdAt: new Date(),
    };

    rooms.set(roomId, room);
    user.roomId = roomId;

    socket.join(roomId);
    socket.emit("roomCreated", { room });

    console.log(`방 ${roomId} (${roomName})이 생성되었습니다.`);

    // 모든 클라이언트에게 방 목록 업데이트 전송
    broadcastRoomList();
  });

  // 방 참가
  socket.on("joinRoom", (roomId) => {
    const user = userSockets.get(socket.id);
    const room = rooms.get(roomId);

    if (!user) {
      socket.emit("error", "닉네임을 먼저 설정해주세요.");
      return;
    }

    if (!room) {
      socket.emit("error", "존재하지 않는 방입니다.");
      return;
    }

    if (room.gameStarted) {
      socket.emit("error", "이미 게임이 시작된 방입니다.");
      return;
    }

    if (room.players.length >= 8) {
      socket.emit("error", "방이 가득 찼습니다.");
      return;
    }

    // 이미 같은 방에 있는지 확인
    if (user.roomId === roomId) {
      socket.emit("error", "이미 이 방에 참가해 있습니다.");
      return;
    }

    // 기존 방에서 나가기
    if (user.roomId) {
      leaveCurrentRoom(socket.id);
    }

    // 새 방 참가
    room.players.push({
      id: socket.id,
      nickname: user.nickname,
      isHost: false,
    });

    user.roomId = roomId;
    socket.join(roomId);

    console.log(`${user.nickname}이 방 ${roomId}에 참가했습니다.`);

    // 방 참가자들에게 업데이트 전송
    io.to(roomId).emit("playerJoined", {
      player: { id: socket.id, nickname: user.nickname, isHost: false },
      room: room,
    });

    socket.emit("roomJoined", { room });
    broadcastRoomList();
  });

  // 방 나가기
  socket.on("leaveRoom", () => {
    const user = userSockets.get(socket.id);
    if (user && user.roomId) {
      console.log(`${user.nickname}이 방 ${user.roomId}에서 나갔습니다.`);
      leaveCurrentRoom(socket.id);
    }
  });

  // 게임 시작 (방장만)
  socket.on("startGame", () => {
    const user = userSockets.get(socket.id);
    if (!user || !user.roomId) {
      socket.emit("error", "방에 참가하지 않았습니다.");
      return;
    }

    const room = rooms.get(user.roomId);
    if (!room) {
      socket.emit("error", "방을 찾을 수 없습니다.");
      return;
    }

    if (room.host !== socket.id) {
      socket.emit("error", "방장만 게임을 시작할 수 있습니다.");
      return;
    }

    if (room.players.length < 2) {
      socket.emit("error", "최소 2명 이상이 있어야 게임을 시작할 수 있습니다.");
      return;
    }

    room.gameStarted = true;
    room.gamePhase = "categorySelection";
    console.log(
      `방 ${user.roomId}에서 게임이 시작되었습니다. (분야 선택 단계)`
    );

    io.to(user.roomId).emit("gameStarted", { room });
    broadcastRoomList();
  });

  // 게임 종료 (방장만)
  socket.on("endGame", () => {
    const user = userSockets.get(socket.id);
    if (!user || !user.roomId) {
      socket.emit("error", "방에 참가하지 않았습니다.");
      return;
    }

    const room = rooms.get(user.roomId);
    if (!room) {
      socket.emit("error", "방을 찾을 수 없습니다.");
      return;
    }

    if (room.host !== socket.id) {
      socket.emit("error", "방장만 게임을 종료할 수 있습니다.");
      return;
    }

    // 진행 중 타이머 정리 후 즉시 종료 처리
    if (room.questionTimeout) {
      clearTimeout(room.questionTimeout);
      room.questionTimeout = null;
    }
    // 바로 종료: 현재 문제 결과 집계 없이 즉시 최종 결과 전송
    endQuiz(user.roomId);
  });

  // 퀴즈 분야 선택 (방장만)
  socket.on("selectCategory", (categoryId) => {
    const user = userSockets.get(socket.id);
    if (!user || !user.roomId) {
      socket.emit("error", "방에 참가하지 않았습니다.");
      return;
    }

    const room = rooms.get(user.roomId);
    if (!room) {
      socket.emit("error", "방을 찾을 수 없습니다.");
      return;
    }

    if (room.host !== socket.id) {
      socket.emit("error", "방장만 분야를 선택할 수 있습니다.");
      return;
    }

    if (room.gamePhase !== "categorySelection") {
      socket.emit("error", "분야 선택 단계가 아닙니다.");
      return;
    }

    const categories = [
      { id: 1, name: "다슬쨩의 애니", description: "애니메이션 관련 퀴즈" },
      { id: 2, name: "모두의 한국사", description: "한국사 관련 퀴즈" },
      { id: 3, name: "몰상식 듀오의 상식", description: "일반상식 관련 퀴즈" },
    ];

    const selectedCategory = categories.find((cat) => cat.id === categoryId);
    if (!selectedCategory) {
      socket.emit("error", "올바르지 않은 분야입니다.");
      return;
    }

    room.selectedCategory = selectedCategory;
    room.gamePhase = "playing";
    room.currentQuestionIndex = 0;
    // 방별 사용된 문제 초기화/준비
    if (!usedQuestionsByRoom.has(user.roomId)) {
      usedQuestionsByRoom.set(user.roomId, new Map());
    }
    const roomUsedMap = usedQuestionsByRoom.get(user.roomId);
    if (!roomUsedMap.has(categoryId)) {
      roomUsedMap.set(categoryId, new Set());
    }
    // 이번 게임에서 아직 나오지 않은 문제만 선별해 셔플 전체 진행
    const available = getUnseenQuestions(categoryId, user.roomId);
    room.questions = available;
    room.playerScores = {};
    room.questionStartTime = Date.now();

    // 플레이어 점수 초기화
    room.players.forEach((player) => {
      room.playerScores[player.id] = 0;
    });

    console.log(
      `방 ${user.roomId}에서 "${selectedCategory.name}" 분야가 선택되었습니다.`
    );

    io.to(user.roomId).emit("categorySelected", {
      room,
      category: selectedCategory,
    });

    // 첫 번째 문제 전송
    setTimeout(() => {
      sendNextQuestion(user.roomId);
    }, 2000);

    broadcastRoomList();
  });

  // 답안 제출
  socket.on("submitAnswer", ({ answer, timeSpent }) => {
    const user = userSockets.get(socket.id);
    if (!user || !user.roomId) {
      socket.emit("error", "방에 참가하지 않았습니다.");
      return;
    }

    const room = rooms.get(user.roomId);
    if (!room || room.gamePhase !== "playing") {
      socket.emit("error", "현재 퀴즈가 진행 중이 아닙니다.");
      return;
    }

    const currentQuestion = room.questions[room.currentQuestionIndex];
    if (!currentQuestion) {
      socket.emit("error", "유효하지 않은 문제입니다.");
      return;
    }

    // 답안 저장 준비
    if (!room.currentAnswers) {
      room.currentAnswers = {};
    }

    // 답안 저장
    room.currentAnswers[socket.id] = {
      answer,
      timeSpent,
      timestamp: Date.now(),
    };

    // 정답 여부 확인 및 잠정 점수 계산(즉시 반영하지 않음)
    const isCorrect = answer === currentQuestion.correct_answer;
    let points = 0;
    if (isCorrect) {
      const maxTime = 9000; // 9초
      const timeBonus = Math.max(0, maxTime - timeSpent) / 1000;
      points = Math.round(100 + timeBonus * 10);
    }

    // 답안 제출 확인 전송
    socket.emit("answerSubmitted", {
      isCorrect,
      points,
      correctAnswer: currentQuestion.correct_answer,
    });

    // 모든 플레이어 제출 여부와 무관하게, 타이머가 결과 표시를 담당 (재제출 허용)
  });

  // 연결 해제
  socket.on("disconnect", () => {
    const user = userSockets.get(socket.id);
    if (user) {
      console.log(
        `사용자 ${user.nickname} (${socket.id})의 연결이 해제되었습니다.`
      );
      leaveCurrentRoom(socket.id);
    }
    userSockets.delete(socket.id);
  });

  // 방 나가기 로직
  function leaveCurrentRoom(socketId) {
    const user = userSockets.get(socketId);
    if (!user || !user.roomId) return;

    const room = rooms.get(user.roomId);
    if (!room) return;

    // 플레이어 목록에서 제거
    room.players = room.players.filter((p) => p.id !== socketId);

    // 방이 비었거나 호스트가 나갔을 때 처리
    if (room.players.length === 0) {
      console.log(`방 ${user.roomId}이 삭제되었습니다.`);
      rooms.delete(user.roomId);
      // 사용된 문제 기록 정리
      usedQuestionsByRoom.delete(user.roomId);
    } else if (room.host === socketId && room.players.length > 0) {
      // 새로운 호스트 지정
      room.host = room.players[0].id;
      room.players[0].isHost = true;
      console.log(`방 ${user.roomId}의 새 호스트: ${room.players[0].nickname}`);
      io.to(user.roomId).emit("hostChanged", { newHost: room.players[0] });
    }

    socket.leave(user.roomId);

    // 남은 플레이어들에게 업데이트 전송
    if (room.players.length > 0) {
      io.to(user.roomId).emit("playerLeft", {
        playerId: socketId,
        room: room,
      });
    }

    user.roomId = null;
    broadcastRoomList();
  }

  // (방 목록 브로드캐스트 함수는 전역으로 이동)
});

// 퀴즈 관련 함수들
function getRandomQuestions(categoryId, count = 5) {
  const categoryData = quizData[categoryId];
  if (!categoryData || !categoryData.questions) {
    return [];
  }

  const questions = [...categoryData.questions];
  const shuffled = questions.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, questions.length));
}

// 방 기준으로 아직 출제되지 않은 문제 리스트를 셔플해 반환
function getUnseenQuestions(categoryId, roomId) {
  const categoryData = quizData[categoryId];
  if (!categoryData || !Array.isArray(categoryData.questions)) return [];
  const usedMap = usedQuestionsByRoom.get(roomId)?.get(categoryId) || new Set();
  const unseen = categoryData.questions.filter((q) => !usedMap.has(q.id));
  const shuffled = unseen.sort(() => 0.5 - Math.random());
  return shuffled;
}

function sendNextQuestion(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.gamePhase !== "playing") return;

  const question = room.questions[room.currentQuestionIndex];
  if (!question) {
    // 모든 문제 완료
    endQuiz(roomId);
    return;
  }

  // 이전 답안 초기화
  room.currentAnswers = {};
  room.questionStartTime = Date.now();
  room.resultShown = false; // 이번 문제 결과 아직 미표시

  // 이전 타이머가 남아있으면 정리
  if (room.questionTimeout) {
    clearTimeout(room.questionTimeout);
    room.questionTimeout = null;
  }

  // 클라이언트에 문제 전송 (정답 제외)
  const questionData = {
    questionNumber: room.currentQuestionIndex + 1,
    totalQuestions: room.questions.length,
    question: question.question,
    options: shuffleArray([
      question.correct_answer,
      ...question.incorrect_answers,
    ]),
    difficulty: question.difficulty,
    timeLimit: 9000, // 9초
  };

  io.to(roomId).emit("questionStart", questionData);

  // 9초 후 자동으로 결과 표시 (중복 방지를 위해 핸들 저장)
  room.questionTimeout = setTimeout(() => {
    showQuestionResult(roomId);
  }, 9000);
}

function showQuestionResult(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  // 이미 결과를 표시했다면 중복 호출 방지
  if (room.resultShown) return;
  room.resultShown = true;

  // 예정된 타이머가 있으면 해제
  if (room.questionTimeout) {
    clearTimeout(room.questionTimeout);
    room.questionTimeout = null;
  }

  const question = room.questions && room.questions[room.currentQuestionIndex];
  if (!question) {
    endQuiz(roomId);
    return;
  }

  // 결과 데이터 준비
  // 최종 점수 반영: 제출된 최종 답안 기준
  Object.entries(room.currentAnswers || {}).forEach(([playerId, ans]) => {
    const isCorrect = ans && ans.answer === question.correct_answer;
    if (isCorrect) {
      const maxTime = 9000;
      const timeBonus = Math.max(0, maxTime - (ans.timeSpent || 9000)) / 1000;
      const points = Math.round(100 + timeBonus * 10);
      room.playerScores[playerId] = (room.playerScores[playerId] || 0) + points;
    }
  });

  const results = {
    correctAnswer: question.correct_answer,
    explanation: question.explanation,
    playerResults: room.players.map((player) => {
      const answer = room.currentAnswers[player.id];
      const isCorrect = answer && answer.answer === question.correct_answer;
      return {
        playerId: player.id,
        nickname: player.nickname,
        answer: answer ? answer.answer : "미제출",
        isCorrect,
        timeSpent: answer ? answer.timeSpent : 9000,
        score: room.playerScores[player.id] || 0,
      };
    }),
  };

  io.to(roomId).emit("questionResult", results);

  // 3.9초 후 다음 문제 또는 게임 종료
  setTimeout(() => {
    // 사용된 문제 기록에 현재 문제 ID 추가 (중복 방지)
    try {
      const categoryId = room.selectedCategory?.id;
      if (categoryId && question.id != null) {
        if (!usedQuestionsByRoom.has(room.id)) {
          usedQuestionsByRoom.set(room.id, new Map());
        }
        const usedMap = usedQuestionsByRoom.get(room.id);
        if (!usedMap.has(categoryId)) {
          usedMap.set(categoryId, new Set());
        }
        usedMap.get(categoryId).add(question.id);
      }
    } catch (e) {
      // no-op
    }

    room.currentQuestionIndex++;
    if (room.currentQuestionIndex < room.questions.length) {
      sendNextQuestion(roomId);
    } else {
      endQuiz(roomId);
    }
  }, 3800);
}

function endQuiz(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.gamePhase = "finished";

  // 최종 순위 계산
  const sorted = room.players
    .map((player) => ({
      nickname: player.nickname,
      score: room.playerScores[player.id] || 0,
    }))
    .sort((a, b) => b.score - a.score);
  // 공동 순위 부여
  let lastScore = null;
  let lastRank = 0;
  const finalScores = sorted.map((entry, idx) => {
    if (lastScore === null || entry.score < lastScore) {
      lastRank = idx + 1;
      lastScore = entry.score;
    }
    return { ...entry, rank: lastRank };
  });

  io.to(roomId).emit("quizFinished", {
    finalScores,
    category: room.selectedCategory.name,
  });

  // 5초 후 대기실로 돌아가기
  setTimeout(() => {
    room.gameStarted = false;
    room.gamePhase = "waiting";
    room.selectedCategory = null;
    room.currentQuestionIndex = 0;
    room.questions = [];
    room.playerScores = {};
    room.currentAnswers = {};

    io.to(roomId).emit("backToWaiting", { room });
    broadcastRoomList();
  }, 10000);
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 방 ID 생성 함수
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// 서버 시작
const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`로컬: http://localhost:${PORT}`);
  console.log(`네트워크: http://10.13.100.42:${PORT}`);
});
