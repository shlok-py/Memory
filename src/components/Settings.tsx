import React, { useState, useRef } from 'react';
import { updateUser, getApiKey, saveApiKey } from '../services/storage';
import { X, User, Palette, Save, Bot, Camera, Trash2 } from 'lucide-react';

interface SettingsProps {
  onClose: () => void;
  username: string;
  theme: string;
  onThemeChange: (theme: 'light' | 'dark') => void;
  onUsernameChange: (newUsername: string) => void;
  onLogout: () => void;
  profilePic: string | null;
  onProfilePicChange: (pic: string | null) => void;
}

export const Settings: React.FC<SettingsProps> = ({ 
  onClose, 
  username, 
  theme, 
  onThemeChange, 
  onUsernameChange,
  onLogout,
  profilePic,
  onProfilePicChange,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'profile' | 'ai'>('general');
  const [newUsername, setNewUsername] = useState(username);
  const [geminiKey, setGeminiKey] = useState('');
  const picInputRef = useRef<HTMLInputElement>(null);

  // Load encrypted API key on mount
  React.useEffect(() => {
    getApiKey().then(setGeminiKey);
  }, []);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    
    if (!password) {
      setError('Current password is required to update profile');
      return;
    }

    try {
      await updateUser(username, newUsername, password);
      setMessage('Profile updated successfully');
      if (username !== newUsername) {
        onUsernameChange(newUsername);
      }
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    }
  };

  const handleSaveGeminiKey = async () => {
    await saveApiKey(geminiKey);
    setMessage('API Key saved successfully');
    setTimeout(() => setMessage(''), 3000);
  };

  const handlePicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      onProfilePicChange(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="btn icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="settings-layout">
          <div className="settings-sidebar">
            <button 
              className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <Palette size={16} /> General
            </button>
            <button 
              className={`settings-tab ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <User size={16} /> Profile
            </button>
            <button 
              className={`settings-tab ${activeTab === 'ai' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai')}
            >
              <Bot size={16} /> AI Settings
            </button>
          </div>

          <div className="settings-content">
            {activeTab === 'general' && (
              <div className="settings-section">
                <h3>Appearance</h3>
                <div className="setting-row">
                  <span>Theme</span>
                  <div className="theme-toggle">
                    <button 
                      className={`btn ${theme === 'light' ? 'active-theme' : ''}`}
                      onClick={() => onThemeChange('light')}
                    >
                      Light
                    </button>
                    <button 
                      className={`btn ${theme === 'dark' ? 'active-theme' : ''}`}
                      onClick={() => onThemeChange('dark')}
                    >
                      Dark
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="settings-section">
                <h3>Profile Information</h3>

                {/* Profile Picture */}
                <div className="profile-pic-section">
                  <div className="profile-pic-preview">
                    {profilePic
                      ? <img src={profilePic} alt="Profile" className="profile-pic-img" />
                      : <div className="profile-pic-placeholder">{username.charAt(0).toUpperCase()}</div>
                    }
                  </div>
                  <div className="profile-pic-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => picInputRef.current?.click()}
                      style={{ gap: '0.4rem' }}
                    >
                      <Camera size={15} /> {profilePic ? 'Change Photo' : 'Upload Photo'}
                    </button>
                    {profilePic && (
                      <button
                        type="button"
                        className="btn danger-btn"
                        onClick={() => onProfilePicChange(null)}
                        style={{ gap: '0.4rem' }}
                      >
                        <Trash2 size={15} /> Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={picInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handlePicUpload}
                  />
                </div>

                <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-color)' }} />
                
                {message && <div className="success-msg">{message}</div>}
                {error && <div className="error-msg">{error}</div>}

                <form onSubmit={handleUpdateProfile} className="profile-form">
                  <div className="form-group">
                    <label>Username</label>
                    <input 
                      type="text" 
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value)}
                      className="settings-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Current Password (required to save changes)</label>
                    <input 
                      type="password" 
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="settings-input"
                      placeholder="Enter password..."
                    />
                  </div>
                  <button type="submit" className="btn primary-btn" style={{ marginTop: '1rem' }}>
                    <Save size={16} /> Save Changes
                  </button>
                </form>

                <hr style={{ margin: '2rem 0', borderColor: 'var(--border-color)' }} />
                
                <h3>Account Actions</h3>
                <button className="btn danger-btn" onClick={onLogout}>
                  Log Out
                </button>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="settings-section">
                <h3>AI Assistant (Gemini)</h3>
                
                {message && <div className="success-msg">{message}</div>}

                <div className="form-group">
                  <label>Gemini API Key</label>
                  <input 
                    type="password" 
                    value={geminiKey}
                    onChange={e => setGeminiKey(e.target.value)}
                    className="settings-input"
                    placeholder="Enter Gemini API key..."
                  />
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    Your API key is stored locally in your browser and used to connect to Google's Gemini models.
                  </p>
                </div>
                <button onClick={handleSaveGeminiKey} className="btn primary-btn" style={{ marginTop: '1rem' }}>
                  <Save size={16} /> Save API Key
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
