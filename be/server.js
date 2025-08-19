const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

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

// 게임 상태 저장
const rooms = new Map(); // roomId -> { name, host, players, gameStarted }
const userSockets = new Map(); // socketId -> { nickname, roomId }

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
      { id: 4, name: "윤하의 수학 교실", description: "수학 관련 퀴즈" },
    ];

    const selectedCategory = categories.find((cat) => cat.id === categoryId);
    if (!selectedCategory) {
      socket.emit("error", "올바르지 않은 분야입니다.");
      return;
    }

    room.selectedCategory = selectedCategory;
    room.gamePhase = "playing";

    console.log(
      `방 ${user.roomId}에서 "${selectedCategory.name}" 분야가 선택되었습니다.`
    );

    io.to(user.roomId).emit("categorySelected", {
      room,
      category: selectedCategory,
    });
    broadcastRoomList();
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

  // 방 목록 브로드캐스트
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
});

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
