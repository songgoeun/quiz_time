import React, { useState, useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext";
import {
  type GameRoom as GameRoomType,
  type Player,
  QUIZ_CATEGORIES,
  type QuizQuestion,
  type QuestionResult,
  type FinalScore,
} from "../types";

interface GameRoomProps {
  room: GameRoomType;
  nickname: string;
  onLeaveRoom: () => void;
}

const GameRoom: React.FC<GameRoomProps> = ({ room, nickname, onLeaveRoom }) => {
  const [currentRoom, setCurrentRoom] = useState<GameRoomType>(room);
  const [isHost, setIsHost] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(
    null
  );
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [questionResult, setQuestionResult] = useState<QuestionResult | null>(
    null
  );
  const [finalScores, setFinalScores] = useState<FinalScore[]>([]);
  const [submittedAnswer, setSubmittedAnswer] = useState<string>("");
  const [chatMessages, setChatMessages] = useState<
    Array<{
      id: string;
      playerId: string;
      nickname: string;
      text: string;
      timestamp: number;
    }>
  >([]);
  const [chatInput, setChatInput] = useState("");
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const [showResult, setShowResult] = useState(false);
  const { socket } = useSocket();

  useEffect(() => {
    setCurrentRoom(room);
    // 같은 닉네임이어도 소켓 ID로 방장 여부 판단
    setIsHost(room.host === socket?.id);
  }, [room, socket?.id]);

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
      setIsHost(newHost.id === socket?.id);
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
      alert(`"${category.name}" 분야가 선택되었습니다! 곧 퀴즈가 시작됩니다.`);
    };

    const handleQuestionStart = (question: QuizQuestion) => {
      setCurrentQuestion(question);
      setSelectedAnswer("");
      setTimeLeft(question.timeLimit / 1000);
      setQuestionResult(null);
      setShowResult(false);
      setSubmittedAnswer("");
    };

    const handleQuestionResult = (result: QuestionResult) => {
      setQuestionResult(result);
      setShowResult(true);
      setCurrentQuestion(null);
      // 참가자 점수 즉시 반영
      setCurrentRoom((prev) => {
        const updatedScores: { [playerId: string]: number } = {
          ...(prev.playerScores || {}),
        };
        result.playerResults.forEach((r) => {
          const player = prev.players.find((p) => p.nickname === r.nickname);
          const playerId = (player && player.id) || r.playerId;
          if (playerId) {
            updatedScores[playerId] = r.score;
          }
        });
        return { ...prev, playerScores: updatedScores } as GameRoomType;
      });
    };

    const handleQuizFinished = ({
      finalScores: scores,
    }: {
      finalScores: FinalScore[];
    }) => {
      setFinalScores(scores);
      setCurrentQuestion(null);
      setQuestionResult(null);
      setShowResult(false);
    };

    const handleBackToWaiting = ({
      room: updatedRoom,
    }: {
      room: GameRoomType;
    }) => {
      setCurrentRoom(updatedRoom);
      setCurrentQuestion(null);
      setQuestionResult(null);
      setFinalScores([]);
      setShowResult(false);
      setSelectedAnswer("");
      setChatMessages([]);
    };

    const handleAnswerSubmitted = ({
      isCorrect,
      points,
    }: {
      isCorrect: boolean;
      points: number;
    }) => {
      // 답안 제출 완료 피드백
      console.log(`답안 제출: ${isCorrect ? "정답" : "오답"}, 점수: ${points}`);
    };

    const handleError = (message: string) => {
      alert(message);
    };

    socket.on("playerJoined", handlePlayerJoined);
    socket.on("playerLeft", handlePlayerLeft);
    socket.on("hostChanged", handleHostChanged);
    socket.on("gameStarted", handleGameStarted);
    socket.on("categorySelected", handleCategorySelected);
    socket.on("questionStart", handleQuestionStart);
    socket.on("questionResult", handleQuestionResult);
    socket.on("quizFinished", handleQuizFinished);
    socket.on("backToWaiting", handleBackToWaiting);
    socket.on("answerSubmitted", handleAnswerSubmitted);
    socket.on("error", handleError);
    socket.on(
      "chatHistory",
      (
        history: Array<{
          id: string;
          playerId: string;
          nickname: string;
          text: string;
          timestamp: number;
        }>
      ) => {
        setChatMessages(history);
      }
    );
    socket.on(
      "chatMessage",
      (msg: {
        id: string;
        playerId: string;
        nickname: string;
        text: string;
        timestamp: number;
      }) => {
        setChatMessages((prev) => [...prev, msg]);
      }
    );

    return () => {
      socket.off("playerJoined", handlePlayerJoined);
      socket.off("playerLeft", handlePlayerLeft);
      socket.off("hostChanged", handleHostChanged);
      socket.off("gameStarted", handleGameStarted);
      socket.off("categorySelected", handleCategorySelected);
      socket.off("questionStart", handleQuestionStart);
      socket.off("questionResult", handleQuestionResult);
      socket.off("quizFinished", handleQuizFinished);
      socket.off("backToWaiting", handleBackToWaiting);
      socket.off("answerSubmitted", handleAnswerSubmitted);
      socket.off("error", handleError);
      socket.off("chatHistory");
      socket.off("chatMessage");
    };
  }, [socket, nickname]);

  // 채팅 자동 스크롤: 새 메시지가 올 때마다 맨 아래로 이동
  useEffect(() => {
    const el = chatListRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages]);

  // 타이머 효과
  useEffect(() => {
    if (timeLeft > 0 && currentQuestion) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft, currentQuestion]);

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

  const submitAnswer = (overrideAnswer?: string) => {
    const answerToSend = overrideAnswer || selectedAnswer;
    if (!socket || !answerToSend || !currentQuestion) {
      return;
    }

    const timeSpent = currentQuestion.timeLimit / 1000 - timeLeft;
    socket.emit("submitAnswer", {
      answer: answerToSend,
      timeSpent: timeSpent * 1000,
    });

    // UI 상태 업데이트
    setSubmittedAnswer(answerToSend);
  };

  const endGame = () => {
    if (!socket) return;
    socket.emit("endGame");
  };

  const sendMessage = () => {
    if (!socket) return;
    const text = chatInput.trim();
    if (!text) return;
    socket.emit("sendMessage", { text });
    setChatInput("");
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
        <div className="bg-white rounded-lg shadow-xl p-6 mb-6 hidden md:block">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                {currentRoom.name}
              </h1>
              <p className="text-gray-600">방 ID: {currentRoom.id}</p>
              <p className="text-gray-500 text-sm mt-1">
                나: <span className="font-semibold">{nickname}</span> (
                <span className="font-mono text-xs">{socket?.id}</span>)
              </p>
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

        {/* 퀴즈 진행 화면 */}
        {currentQuestion && (
          <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-lg font-semibold text-gray-700">
                문제 {currentQuestion.questionNumber} /{" "}
                {currentQuestion.totalQuestions}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  난이도: {currentQuestion.difficulty}
                </span>
                <div
                  className={`text-xl font-bold ${
                    timeLeft <= 5 ? "text-red-500" : "text-blue-600"
                  }`}
                >
                  ⏰ {timeLeft}초
                </div>
              </div>
            </div>

            <h2 className="text-xl font-bold text-gray-800 mb-6">
              {currentQuestion.question}
            </h2>

            <div className="grid gap-3">
              {currentQuestion.options.map((option, index) => {
                const isChosenNow = selectedAnswer === option;
                const isSubmitted = submittedAnswer === option;
                return (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedAnswer(option);
                      submitAnswer(option);
                    }}
                    className={`p-4 border rounded-lg text-left transition-colors flex items-center justify-between ${
                      isChosenNow
                        ? "bg-blue-100 border-blue-500 text-blue-700"
                        : "border-gray-200 hover:bg-gray-50 hover:border-blue-300"
                    }`}
                  >
                    <div>
                      <span className="font-medium">
                        {String.fromCharCode(65 + index)}.
                      </span>{" "}
                      {option}
                    </div>
                    {isSubmitted && (
                      <span className="ml-3 text-xs px-2 py-1 rounded bg-green-100 text-green-700">
                        제출됨
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 자동 제출 모드: 별도 제출 버튼 없음 */}
          </div>
        )}

        {/* 문제 결과 화면 */}
        {showResult && questionResult && (
          <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                문제 결과
              </h2>
              <div className="text-lg">
                <span className="text-green-600 font-bold">
                  정답: {questionResult.correctAnswer}
                </span>
              </div>
              <p className="text-gray-600 mt-2">{questionResult.explanation}</p>
            </div>

            <div className="space-y-3">
              {questionResult.playerResults.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{result.nickname}</span>
                    {result.streakCount && result.streakCount > 1 && (
                      <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">
                        🔥 {result.streakCount}연속
                        {typeof result.streakBonus === "number" &&
                        result.streakBonus > 0
                          ? ` (+${result.streakBonus})`
                          : ""}
                      </span>
                    )}
                    {result.fastest && (
                      <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
                        ⚡ 최속
                        {typeof result.fastestBonus === "number" &&
                        result.fastestBonus > 0
                          ? ` (+${result.fastestBonus})`
                          : ""}
                      </span>
                    )}
                    <span
                      className={`text-sm px-2 py-1 rounded ${
                        result.isCorrect
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {result.answer}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{result.score}점</div>
                    <div className="text-xs text-gray-500">
                      {(result.timeSpent / 1000).toFixed(1)}초
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 최종 결과 화면 */}
        {finalScores.length > 0 && (
          <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                🏆 최종 결과
              </h2>
              <p className="text-gray-600">
                "{currentRoom.selectedCategory?.name}" 퀴즈가 끝났습니다!
              </p>
            </div>

            <div className="space-y-3">
              {finalScores.map((score, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-4 rounded-lg ${
                    (score.rank ?? index + 1) === 1
                      ? "bg-yellow-100 border-2 border-yellow-400"
                      : (score.rank ?? index + 1) === 2
                      ? "bg-gray-100 border-2 border-gray-400"
                      : (score.rank ?? index + 1) === 3
                      ? "bg-orange-100 border-2 border-orange-400"
                      : "bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {(score.rank ?? index + 1) === 1
                        ? "🥇"
                        : (score.rank ?? index + 1) === 2
                        ? "🥈"
                        : (score.rank ?? index + 1) === 3
                        ? "🥉"
                        : `${score.rank ?? index + 1}위`}
                    </span>
                    <span className="font-bold text-lg">{score.nickname}</span>
                  </div>
                  <span className="text-xl font-bold text-blue-600">
                    {score.score}점
                  </span>
                </div>
              ))}
            </div>

            <div className="text-center mt-6 text-gray-600">
              잠시 후 대기실로 돌아갑니다...
            </div>
          </div>
        )}

        <div className="flex flex-col md:grid md:grid-cols-2 gap-6">
          {/* 참가자 목록 */}
          <div className="order-2 md:order-1 bg-white rounded-lg shadow-xl p-6">
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
                    <div>
                      <div className="font-medium text-gray-800 flex items-center gap-2">
                        {player.nickname}
                        {player.id === socket?.id && (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                            나
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">
                        {player.id}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {currentRoom.playerScores &&
                      currentRoom.playerScores[player.id] !== undefined && (
                        <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          {currentRoom.playerScores[player.id]}점
                        </span>
                      )}
                    {player.isHost && (
                      <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-1 rounded">
                        방장
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 게임 컨트롤 */}
          <div className="order-1 md:order-2 bg-white rounded-lg shadow-xl p-6">
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

            {/* 게임 진행 중 - 대기 화면 */}
            {currentRoom.gameStarted &&
              currentRoom.gamePhase === "playing" &&
              !currentQuestion &&
              !showResult &&
              finalScores.length === 0 && (
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
                    "{currentRoom.selectedCategory?.name}" 퀴즈 준비 중...
                  </p>
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                </div>
              )}

            <div className="mt-6 flex flex-col">
              {/* 채팅 (모바일에서 위) */}
              <div className="order-1 md:order-2">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  채팅
                </h3>
                <div
                  ref={chatListRef}
                  className="h-48 overflow-y-auto border border-gray-200 rounded p-3 space-y-2 bg-gray-50"
                >
                  {chatMessages.length === 0 && (
                    <div className="text-center text-sm text-gray-400">
                      아직 메시지가 없습니다.
                    </div>
                  )}
                  {chatMessages.map((m) => (
                    <div key={m.id} className="text-sm">
                      <span
                        className={`font-medium ${
                          m.playerId === socket?.id
                            ? "text-blue-600"
                            : "text-gray-800"
                        }`}
                      >
                        {m.nickname}
                      </span>
                      <span className="text-gray-400 mx-2">•</span>
                      <span className="text-gray-700 break-words">
                        {m.text}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    placeholder="메시지를 입력하세요 (최대 500자)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-base"
                  />
                  <button
                    onClick={sendMessage}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                  >
                    전송
                  </button>
                </div>
              </div>

              {/* 종료 버튼 (모바일에서 아래) */}
              {currentRoom.gameStarted &&
                currentRoom.gamePhase === "playing" && (
                  <div className="order-2 md:order-1 mt-6">
                    {isHost ? (
                      <button
                        onClick={endGame}
                        disabled={finalScores.length > 0}
                        className={`w-full py-3 px-4 rounded-md transition-colors ${
                          finalScores.length > 0
                            ? "bg-gray-400 text-white cursor-not-allowed"
                            : "bg-red-600 text-white hover:bg-red-700"
                        }`}
                      >
                        퀴즈 종료 (방장)
                      </button>
                    ) : (
                      <div className="text-center text-sm text-gray-500">
                        방장이 언제든 퀴즈를 종료할 수 있습니다.
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* 모바일 전용 하단 방 정보 */}
        <div className="bg-white rounded-lg shadow-xl p-6 mt-6 md:hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                {currentRoom.name}
              </h1>
              <p className="text-gray-600">방 ID: {currentRoom.id}</p>
              <p className="text-gray-500 text-sm mt-1">
                나: <span className="font-semibold">{nickname}</span> (
                <span className="font-mono text-xs">{socket?.id}</span>)
              </p>
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
      </div>
    </div>
  );
};

export default GameRoom;
