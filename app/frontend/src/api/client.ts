import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to add the auth token
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const getSessions = async () => {
    const response = await apiClient.get('/sessions/');
    return response.data;
};

export const getSessionDetail = async (sessionId: string) => {
    const response = await apiClient.get(`/sessions/${sessionId}`);
    return response.data;
};

export const deleteSession = async (sessionId: string) => {
    const response = await apiClient.delete(`/sessions/${sessionId}`);
    return response.data;
};

export const getWhisperModel = async () => {
    const response = await apiClient.get('/settings/whisper-model');
    return response.data;
};

export const updateWhisperModel = async (value: string) => {
    const response = await apiClient.post('/settings/whisper-model', { value });
    return response.data;
};

export const transcribeFileStream = async (
  file: File, 
  enableDiarization: boolean,
  onData: (data: any) => void,
  onError: (error: string) => void
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('language', 'ja');
  formData.append('enable_diarization', String(enableDiarization));

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/transcribe/file`, {
        method: 'POST',
        body: formData,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    if (!response.body) {
         throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Process all complete lines
        buffer = lines.pop() || ''; // Keep the last incomplete line in buffer
        
        for (const line of lines) {
            if (line.trim()) {
                try {
                    const data = JSON.parse(line);
                    onData(data);
                } catch (e) {
                    console.error("Error parsing JSON chunk", e);
                }
            }
        }
    }
    
    // Process any remaining buffer
    if (buffer.trim()) {
         try {
            const data = JSON.parse(buffer);
            onData(data);
        } catch (e) {
            console.error("Error parsing JSON chunk", e);
        }
    }

  } catch (error: any) {
    onError(error.message);
  }
};
