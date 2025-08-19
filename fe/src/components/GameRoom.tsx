import React, { useState, useEffect } from "react";
import { useSocket } from "../context/SocketContext";
import {
  type GameRoom as GameRoomType,
  type Player,
  QUIZ_CATEGORIES,
} from "../types";

interface GameRoomProps {
  room: GameRoomType;
  nickname: string;
  onLeaveRoom: () => void;
}

const GameRoom: React.FC<GameRoomProps> = ({ room, nickname, onLeaveRoom }) => {
  const [currentRoom, setCurrentRoom] = useState<GameRoomType>(room);
  const [isHost, setIsHost] = useState(false);
  const { socket } = useSocket();

  useEffect(() => {
    setCurrentRoom(room);
    setIsHost(room.players.some((p) => p.nickname === nickname && p.isHost));
  }, [room, nickname]);

  useEffect(() => {
    if (!socket) return;

    const handlePlayerJoined = ({
      room: updatedRoom,
    }: {
      room: GameRoomType;
    }) => {
      setCurrentRoom(updatedRoom);
    };

    const handlePlayerLeft = ({
      room: updatedRoom,
    }: {
      room: GameRoomType;
    }) => {
      setCurrentRoom(updatedRoom);
    };

    const handleHostChanged = ({ newHost }: { newHost: Player }) => {
      setCurrentRoom((prev) => ({
        ...prev,
        host: newHost.id,
        players: prev.players.map((p) => ({
          ...p,
          isHost: p.id === newHost.id,
        })),
      }));
      setIsHost(newHost.nickname === nickname);
    };

    const handleGameStarted = ({
      room: updatedRoom,
    }: {
      room: GameRoomType;
    }) => {
      setCurrentRoom(updatedRoom);
    };

    const handleCategorySelected = ({
      room: updatedRoom,
      category,
    }: {
      room: GameRoomType;
      category: { id: number; name: string; description: string };
    }) => {
      setCurrentRoom(updatedRoom);
      alert(`"${category.name}" 분야가 선택되었습니다! 게임을 시작합니다.`);
    };

    const handleError = (message: string) => {
      alert(message);
    };

    socket.on("playerJoined", handlePlayerJoined);
    socket.on("playerLeft", handlePlayerLeft);
    socket.on("hostChanged", handleHostChanged);
    socket.on("gameStarted", handleGameStarted);
    socket.on("categorySelected", handleCategorySelected);
    socket.on("error", handleError);

    return () => {
      socket.off("playerJoined", handlePlayerJoined);
      socket.off("playerLeft", handlePlayerLeft);
      socket.off("hostChanged", handleHostChanged);
      socket.off("gameStarted", handleGameStarted);
      socket.off("categorySelected", handleCategorySelected);
      socket.off("error", handleError);
    };
  }, [socket, nickname]);

  const startGame = () => {
    if (!socket) {
      alert("서버에 연결되지 않았습니다.");
      return;
    }
    socket.emit("startGame");
  };

  const selectCategory = (categoryId: number) => {
    if (!socket) {
      alert("서버에 연결되지 않았습니다.");
      return;
    }
    socket.emit("selectCategory", categoryId);
  };

  const leaveRoom = () => {
    if (!socket) {
      onLeaveRoom();
      return;
    }
    socket.emit("leaveRoom");
    onLeaveRoom();
  };

  // 게임 단계별 상태 표시
  const getGameStatusDisplay = () => {
    if (!currentRoom.gameStarted) {
      return (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
          게임 대기 중입니다.
        </div>
      );
    }

    switch (currentRoom.gamePhase) {
      case "categorySelection":
        return (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
            퀴즈 분야를 선택하는 중입니다...
          </div>
        );
      case "playing":
        return (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            "{currentRoom.selectedCategory?.name}" 퀴즈가 진행 중입니다!
          </div>
        );
      default:
        return (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            게임이 진행 중입니다!
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <div className="max-w-4xl mx-auto">
        {/* 방 헤더 */}
        <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                {currentRoom.name}
              </h1>
              <p className="text-gray-600">방 ID: {currentRoom.id}</p>
            </div>
            <button
              onClick={leaveRoom}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
            >
              방 나가기
            </button>
          </div>

          {getGameStatusDisplay()}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* 참가자 목록 */}
          <div className="bg-white rounded-lg shadow-xl p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              참가자 ({currentRoom.players.length}/{currentRoom.maxPlayers})
            </h2>
            <div className="space-y-3">
              {currentRoom.players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                      {player.nickname.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-800">
                      {player.nickname}
                    </span>
                  </div>
                  {player.isHost && (
                    <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-1 rounded">
                      방장
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 게임 컨트롤 */}
          <div className="bg-white rounded-lg shadow-xl p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              게임 컨트롤
            </h2>

            {/* 게임 시작 전 */}
            {!currentRoom.gameStarted && (
              <div className="space-y-4">
                <p className="text-gray-600">
                  게임을 시작하려면 방장이 시작 버튼을 눌러주세요.
                </p>
                <p className="text-sm text-gray-500">
                  최소 2명 이상이 있어야 게임을 시작할 수 있습니다.
                </p>

                {isHost && (
                  <button
                    onClick={startGame}
                    disabled={currentRoom.players.length < 2}
                    className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {currentRoom.players.length < 2
                      ? "참가자가 부족합니다"
                      : "게임 시작!"}
                  </button>
                )}

                {!isHost && (
                  <div className="text-center py-8 text-gray-500">
                    방장이 게임을 시작하기를 기다리고 있습니다...
                  </div>
                )}
              </div>
            )}

            {/* 퀴즈 분야 선택 단계 */}
            {currentRoom.gameStarted &&
              currentRoom.gamePhase === "categorySelection" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    퀴즈 분야를 선택하세요
                  </h3>

                  {isHost ? (
                    <div className="grid gap-3">
                      {QUIZ_CATEGORIES.map((category) => (
                        <button
                          key={category.id}
                          onClick={() => selectCategory(category.id)}
                          className="text-left p-4 border border-gray-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{category.emoji}</span>
                            <div>
                              <div className="font-medium text-gray-800">
                                {category.name}
                              </div>
                              <div className="text-sm text-gray-600">
                                {category.description}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>방장이 퀴즈 분야를 선택하고 있습니다...</p>
                      <div className="mt-4 space-y-2">
                        {QUIZ_CATEGORIES.map((category) => (
                          <div
                            key={category.id}
                            className="flex items-center gap-2 text-sm text-gray-400"
                          >
                            <span>{category.emoji}</span>
                            <span>{category.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

            {/* 게임 진행 중 */}
            {currentRoom.gameStarted && currentRoom.gamePhase === "playing" && (
              <div className="text-center py-8">
                <div className="mb-4">
                  <span className="text-3xl">
                    {
                      QUIZ_CATEGORIES.find(
                        (c) => c.id === currentRoom.selectedCategory?.id
                      )?.emoji
                    }
                  </span>
                </div>
                <p className="text-green-600 font-medium mb-2">
                  "{currentRoom.selectedCategory?.name}" 퀴즈가 진행 중입니다!
                </p>
                <p className="text-gray-600">
                  실제 퀴즈 기능은 곧 추가될 예정입니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameRoom;
