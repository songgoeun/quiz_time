import React, { useState, useEffect } from "react";
import { useSocket } from "../context/SocketContext";
import { fetchRooms } from "../utils/api";
import type { Room, GameRoom } from "../types";

interface RoomListProps {
  nickname: string;
  onJoinRoom: (room: GameRoom) => void;
}

const RoomList: React.FC<RoomListProps> = ({ nickname, onJoinRoom }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [loading, setLoading] = useState(false);
  const { socket } = useSocket();

  useEffect(() => {
    // 초기 방 목록 로드
    const loadRooms = async () => {
      try {
        const roomList = await fetchRooms();
        setRooms(roomList);
      } catch (error) {
        console.error("방 목록 로드 실패:", error);
      }
    };

    loadRooms();
  }, []);

  useEffect(() => {
    if (!socket) return;

    // Socket 이벤트 리스너
    const handleRoomListUpdated = (roomList: Room[]) => {
      setRooms(roomList);
    };

    const handleRoomCreated = ({ room }: { room: GameRoom }) => {
      setLoading(false);
      setShowCreateModal(false);
      setNewRoomName("");
      onJoinRoom(room);
    };

    const handleRoomJoined = ({ room }: { room: GameRoom }) => {
      onJoinRoom(room);
    };

    const handleError = (message: string) => {
      setLoading(false);
      alert(message);
    };

    socket.on("roomListUpdated", handleRoomListUpdated);
    socket.on("roomCreated", handleRoomCreated);
    socket.on("roomJoined", handleRoomJoined);
    socket.on("error", handleError);

    return () => {
      socket.off("roomListUpdated", handleRoomListUpdated);
      socket.off("roomCreated", handleRoomCreated);
      socket.off("roomJoined", handleRoomJoined);
      socket.off("error", handleError);
    };
  }, [socket, onJoinRoom]);

  const createRoom = () => {
    if (newRoomName.trim().length < 2) {
      alert("방 이름은 2글자 이상 입력해주세요.");
      return;
    }

    if (!socket) {
      alert("서버에 연결되지 않았습니다.");
      return;
    }

    setLoading(true);
    socket.emit("createRoom", newRoomName.trim());
  };

  const joinRoom = (roomId: string) => {
    if (!socket) {
      alert("서버에 연결되지 않았습니다.");
      return;
    }

    socket.emit("joinRoom", roomId);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setNewRoomName("");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">퀴즈 채팅봇</h1>
              <p className="text-gray-600">안녕하세요, {nickname}님!</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors"
            >
              방 만들기
            </button>
          </div>
        </div>

        {/* 방 목록 */}
        <div className="bg-white rounded-lg shadow-xl p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            게임 방 목록
          </h2>
          {rooms.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>아직 만들어진 방이 없습니다.</p>
              <p>첫 번째 방을 만들어보세요!</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-800">{room.name}</h3>
                      <p className="text-sm text-gray-600">
                        {room.playerCount}/{room.maxPlayers}명 참여중
                        {room.gameStarted && (
                          <span className="ml-2 text-red-500">게임 진행중</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => joinRoom(room.id)}
                      disabled={
                        room.gameStarted || room.playerCount >= room.maxPlayers
                      }
                      className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                      참가하기
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 방 만들기 모달 */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                새 방 만들기
              </h3>
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && createRoom()}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
                placeholder="방 이름을 입력하세요"
                maxLength={50}
                disabled={loading}
              />
              <div className="flex gap-2">
                <button
                  onClick={closeModal}
                  disabled={loading}
                  className="flex-1 bg-gray-500 text-white py-2 px-4 rounded-md hover:bg-gray-600 disabled:bg-gray-400 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={createRoom}
                  disabled={loading || newRoomName.trim().length < 2}
                  className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
                >
                  {loading ? "만드는 중..." : "만들기"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomList;
