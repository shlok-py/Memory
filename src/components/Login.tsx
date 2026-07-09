import React, { useState } from 'react';
import { loginUser, registerUser } from '../services/storage';
import { KeyRound, User } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string) => void;
}

// Simple in-memory rate limiter: track failed attempts per username
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000; // 1 minute

function checkRateLimit(username: string): void {
  const record = failedAttempts.get(username);
  if (record && record.lockedUntil > Date.now()) {
    const secsLeft = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    throw new Error(`Too many failed attempts. Try again in ${secsLeft}s.`);
  }
}

function recordFailure(username: string): void {
  const record = failedAttempts.get(username) ?? { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MS;
    record.count = 0;
  }
  failedAttempts.set(username, record);
}

function clearFailures(username: string): void {
  failedAttempts.delete(username);
}

function validateInputs(username: string, password: string): string | null {
  if (!username || !password) return 'Please fill in all fields.';
  if (username.length > 64) return 'Username must be 64 characters or fewer.';
  if (!/^[a-zA-Z0-9_.\-@]+$/.test(username))
    return 'Username may only contain letters, numbers, and _.-@';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  return null;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateInputs(username, password);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      if (isLogin) {
        checkRateLimit(username);
        try {
          await loginUser(username, password);
          clearFailures(username);
          onLogin(username);
        } catch (err) {
          recordFailure(username);
          throw err;
        }
      } else {
        await registerUser(username, password);
        onLogin(username);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
        <p className="login-subtitle">
          {isLogin ? 'Enter your details to access your workspace' : 'Sign up to start taking notes and drawing'}
        </p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <User size={18} className="input-icon" />
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="login-input"
              maxLength={64}
              autoComplete="username"
            />
          </div>
          <div className="input-group">
            <KeyRound size={18} className="input-icon" />
            <input
              type="password"
              placeholder={isLogin ? 'Password' : 'Password (min 8 characters)'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              maxLength={128}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </div>

          <button type="submit" className="login-btn">
            {isLogin ? 'Log In' : 'Sign Up'}
          </button>
        </form>

        <div className="login-toggle">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }} className="login-link">
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </div>
      </div>
    </div>
  );
};
