import React, { useState } from "react";
import { SocketProvider, useSocket } from "./context/SocketContext";
import NicknameInput from "./components/NicknameInput";
import RoomList from "./components/RoomList";
import GameRoom from "./components/GameRoom";
import type { GameRoom as GameRoomType } from "./types";

// 로딩 컴포넌트
const LoadingScreen: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
    <div className="bg-white rounded-lg shadow-xl p-8 text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
      <p className="text-gray-600">서버에 연결 중...</p>
    </div>
  </div>
);

// 메인 앱 로직
const AppContent: React.FC = () => {
  const [nickname, setNickname] = useState<string | null>(null);
  const [currentRoom, setCurrentRoom] = useState<GameRoomType | null>(null);
  const { socket, connected } = useSocket();

  const handleNicknameSet = (nickname: string) => {
    setNickname(nickname);
  };

  const handleJoinRoom = (room: GameRoomType) => {
    setCurrentRoom(room);
  };

  const handleLeaveRoom = () => {
    setCurrentRoom(null);
  };

  // 서버 연결 확인
  if (!socket || !connected) {
    return <LoadingScreen />;
  }

  // 화면 분기
  if (!nickname) {
    return <NicknameInput onNicknameSet={handleNicknameSet} />;
  }

  if (nickname && !currentRoom) {
    return <RoomList nickname={nickname} onJoinRoom={handleJoinRoom} />;
  }

  if (nickname && currentRoom) {
    return (
      <GameRoom
        room={currentRoom}
        nickname={nickname}
        onLeaveRoom={handleLeaveRoom}
      />
    );
  }

  return null;
};

// 메인 앱 컴포넌트
const App: React.FC = () => {
  return (
    <SocketProvider>
      <AppContent />
    </SocketProvider>
  );
};

export default App;
