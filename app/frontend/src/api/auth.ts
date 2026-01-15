import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const login = async (username: string, password: string) => {
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    
    const response = await axios.post(`${API_URL}/auth/login`, params, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    const data = response.data;
    
    if (data.access_token) {
        localStorage.setItem('token', data.access_token);
    }
    return data;
};

export const logout = () => {
    localStorage.removeItem('token');
};

export const getCurrentUser = async () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    
    try {
        const response = await axios.get(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } catch (err) {
        localStorage.removeItem('token');
        return null;
    }
};

export const isAuthenticated = () => {
    return !!localStorage.getItem('token');
};
