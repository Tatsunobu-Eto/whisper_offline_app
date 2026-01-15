import { apiClient } from './client';

export interface User {
    id: string;
    username: string;
    email?: string;
    role: string;
}

export interface UserCreate {
    username: string;
    password: string;
    email?: string;
    role: string;
}

export const getUsers = async (): Promise<User[]> => {
    const response = await apiClient.get('/users/');
    return response.data;
};

export const createUser = async (userData: UserCreate): Promise<User> => {
    const response = await apiClient.post('/users/', userData);
    return response.data;
};

export const deleteUser = async (userId: string): Promise<User> => {
    const response = await apiClient.delete(`/users/${userId}`);
    return response.data;
};
