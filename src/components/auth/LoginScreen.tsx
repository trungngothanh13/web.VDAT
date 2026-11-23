import React, { useState } from 'react';
import type { useAuth } from '../../hooks/useAuth';

type AuthHook = ReturnType<typeof useAuth>;

interface LoginScreenProps {
  auth: AuthHook;
}

export function LoginScreen({ auth }: LoginScreenProps) {
  const [email, setEmail] = useState('admin@vdat.local');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await auth.login({ email, password });
    } catch {
      // Error is stored in auth.error
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="sign-in-heading">
        <div>
          <div className="badge badge-standby" style={{ marginBlockEnd: '0.6rem' }}>
            VDAT Surveillance Control
          </div>
          <h1 id="sign-in-heading" style={{ fontSize: '1.35rem', fontWeight: 700 }}>
            Sign In to VDAT Hub
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBlockStart: '0.25rem' }}>
            Authorized Police Officer or System Administrator credentials are required to access live camera feeds, violation evidence streams, and zone configuration.
          </p>
        </div>

        <form
          className="form-grid"
          method="post"
          action="/api/auth/login"
          onSubmit={handleLoginSubmit}
        >
          <div className="form-field">
            <label htmlFor="email" className="form-label">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              autoComplete="username"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              enterKeyHint="next"
              value={email}
              onChange={(e) => {
                if (auth.error) auth.clearError();
                setEmail(e.target.value);
              }}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="current-password" className="form-label">
              Password
            </label>
            <div className="password-input-row">
              <input
                id="current-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                autoComplete="current-password"
                enterKeyHint="done"
                value={password}
                onChange={(e) => {
                  if (auth.error) auth.clearError();
                  setPassword(e.target.value);
                }}
                required
              />
              <button
                type="button"
                className="btn"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div aria-live="polite">
            {auth.error && (
              <div
                style={{
                  color: 'var(--danger-text)',
                  background: 'var(--danger-soft)',
                  border: '1px solid var(--danger-border)',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.82rem',
                }}
              >
                {auth.error}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-active"
            style={{ minBlockSize: '48px', fontSize: '0.92rem', fontWeight: 600 }}
            disabled={auth.isLoading}
          >
            {auth.isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="account-preset-box">
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>
            Registered Database Accounts (Quick Fill)
          </div>
          <div className="toolbar-actions">
            <button
              type="button"
              className="btn btn-compact"
              onClick={() => {
                auth.clearError();
                setEmail('admin@vdat.local');
                setPassword('admin123');
              }}
            >
              Admin: admin@vdat.local (Full Access + Zone Editor)
            </button>
            <button
              type="button"
              className="btn btn-compact"
              onClick={() => {
                auth.clearError();
                setEmail('officer@vdat.local');
                setPassword('police123');
              }}
            >
              Officer: officer@vdat.local (Monitor + Review)
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
