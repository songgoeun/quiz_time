// API URL 동적 결정
export const getApiUrl = (): string => {
  // 현재 URL이 네트워크 IP로 시작하는지 확인
  if (window.location.hostname === "10.13.100.42") {
    return "http://10.13.100.42:3001";
  }
  return import.meta.env.VITE_API_URL || "http://localhost:3001";
};

// 방 목록 가져오기
export const fetchRooms = async () => {
  try {
    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/api/rooms`);
    if (!response.ok) {
      throw new Error("Failed to fetch rooms");
    }
    return await response.json();
  } catch (error) {
    console.error("방 목록 로드 실패:", error);
    throw error;
  }
};
