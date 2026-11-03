// src/App.tsx

import { ChatInterface } from './components/ChatInterface';

function App() {
  return (
    <div className="bg-gray-900 text-white min-h-screen p-5 font-sans" style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    }}>
      <header className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight drop-shadow-lg text-white">AI Presentation Maker</h1>
      </header>
      <ChatInterface />
    </div>
  );
}

export default App;