import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register, setAuthToken } from '../lib/auth';
import './Login.css';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const fn = isLogin ? login : register;
      const data = await fn(username, password);

      setAuthToken(data.token);

      setTimeout(() => {
        navigate('/todos');
      }, 100);
    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <h2>{isLogin ? 'Welcome back' : 'Create account'}</h2>

        <p className="login-subtitle">
          {isLogin
            ? 'Log in to continue your focus session.'
            : 'Create an account to start using the hourglass app.'}
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <input
            className="login-input"
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <input
            className="login-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="login-error">{error}</p>}

          <div className="login-actions">
            <button
              className="login-primary-btn"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Please wait...' : isLogin ? 'Login' : 'Register'}
            </button>

            <button
              className="login-secondary-btn"
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              disabled={loading}
            >
              Switch to {isLogin ? 'Register' : 'Login'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}