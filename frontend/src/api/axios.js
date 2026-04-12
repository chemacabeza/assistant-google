import axios from 'axios';

// Create an Axios instance configuring default behavior
export const api = axios.create({
  baseURL: '/', // Because of Vite proxy, relative paths work and go to 8080
  withCredentials: true, // IMPORTANT: Ensure session cookies are sent back
});

// Generic interceptors can be configured here
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Check if the user is unauthorized, meaning the Spring Session cookie expired or is missing
    if (error.response && error.response.status === 401) {
      // Optional: automatically clear user state if we were fetching profile
      console.warn("Unauthorized access or session expired.");
    }
    return Promise.reject(error);
  }
);
