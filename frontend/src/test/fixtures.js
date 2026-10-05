// Response shapes mirror the Spring Boot controllers/entities in backend/src/main/java/com/assistant.

export const userProfile = {
  id: 1,
  email: 'owner@example.com',
  name: 'Ada Lovelace',
  picture: 'https://example.com/ada.png',
  createdAt: '2025-01-15T10:00:00',
  updatedAt: '2025-06-01T10:00:00',
};

export const linkedAccounts = [
  { id: 1, email: 'primary@example.com', name: 'Primary' },
  { id: 2, email: 'work@example.com', name: 'Work Email' },
];
