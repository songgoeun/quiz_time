import React, { useState, useEffect } from "react";
import { useSocket } from "../context/SocketContext";

interface NicknameInputProps {
  onNicknameSet: (nickname: string) => void;
}

const NicknameInput: React.FC<NicknameInputProps> = ({ onNicknameSet }) => {
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const { socket } = useSocket();

  const handleSubmit = () => {
    if (nickname.trim().length < 2) {
      alert("닉네임은 2글자 이상 입력해주세요.");
      return;
    }

    if (!socket) {
      alert("서버에 연결되지 않았습니다.");
      return;
    }

    setLoading(true);
    socket.emit("setNickname", nickname.trim());
  };

  useEffect(() => {
    if (!socket) return;

    const handleNicknameSet = ({
      success,
      nickname: setNickname,
    }: {
      success: boolean;
      nickname: string;
    }) => {
      setLoading(false);
      if (success) {
        onNicknameSet(setNickname);
      }
    };

    socket.on("nicknameSet", handleNicknameSet);
    return () => {
      socket.off("nicknameSet", handleNicknameSet);
    };
  }, [socket, onNicknameSet]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-sm font-medium mb-3">
            <span>⚡ 실시간 멀티플레이</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600 leading-tight">
            심심할 때? <br />
            졸릴 때? <br />
            집에 가고싶을 때?
            <br />
            퀴즈 타임! 🔔
          </h1>
          <p className="mt-3 text-gray-500 text-sm">
            닉네임을 정하고 바로 시작하세요 🚀
          </p>
        </div>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="nickname"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              닉네임을 입력하세요
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="닉네임 (2글자 이상)"
              maxLength={20}
              disabled={loading}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading || nickname.trim().length < 2}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "설정 중..." : "입장하기"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NicknameInput;
