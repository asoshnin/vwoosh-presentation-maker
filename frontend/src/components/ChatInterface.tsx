// src/components/ChatInterface.tsx

import { useState, useCallback, useMemo, useRef } from 'react';
import type { ChangeEvent } from 'react';

import { AVAILABLE_MODELS, chatWithMeta } from '../services/meta';



// --- Interface Definitions ---

interface Message {

  role: 'user' | 'model';

  content: string;

}

interface Slide {

  title: string;

  content: string;

}

interface PresentationOutline {

  title: string;

  slides: Slide[];

}



// --- Constants ---

const MODEL_NAME = AVAILABLE_MODELS[0]; // Meta model served by the backend

const GREETING_MESSAGE: Message = {

  role: 'model',

  content: "Hello! I'm here to help you build a stunning presentation from scratch.\n\nTo start, **what is the primary goal of this presentation?**"

};



// --- Helper Function ---

const fileToBase64 = (file: File): Promise<string> => {

  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.readAsDataURL(file);

    reader.onload = () => resolve(reader.result as string);

    reader.onerror = (error) => reject(error);

  });

};



export function ChatInterface() {

  // --- Chat State ---

  const [messages, setMessages] = useState<Message[]>([GREETING_MESSAGE]);

  const [isLoading, setIsLoading] = useState(false);

  const [error, setError] = useState('');

  // --- Input Ref (Uncontrolled input) ---

  const inputRef = useRef<HTMLInputElement>(null);




  // --- Outline State ---

  const [outline, setOutline] = useState<PresentationOutline | null>(null);

  const [isLoadingOutline, setIsLoadingOutline] = useState(false);



  // --- Brand Kit State ---

  const [primaryColor, setPrimaryColor] = useState('#0072C6');

  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  const [logoError, setLogoError] = useState('');



  // --- Presentation Generation State ---

  const [isLoadingPresentation, setIsLoadingPresentation] = useState(false);

  // --- Debug Test State ---

  const [isLoadingDebugTest, setIsLoadingDebugTest] = useState(false);

  const [debugErrors, setDebugErrors] = useState<string[]>([]);

  const [debugWarnings, setDebugWarnings] = useState<string[]>([]);

  const [debugSlidesCreated, setDebugSlidesCreated] = useState<number>(0);



  const userMessageCount = useMemo(() => messages.filter(m => m.role === 'user').length, [messages]);

  // --- Chat Send Handler ---

  const handleSend = useCallback(async (e?: React.FormEvent) => {

    e?.preventDefault();

    // Get value from ref (uncontrolled input)

    const currentInput = inputRef.current?.value || '';

    console.log('handleSend called', { isLoading, input: currentInput.trim() });

    if (isLoading || !currentInput.trim()) return;

    setIsLoading(true);

    setError('');

    const userMessage: Message = { role: 'user', content: currentInput };

    const newMessages = [...messages, userMessage];

    setMessages(newMessages);

    // Clear input using ref

    if (inputRef.current) {

      inputRef.current.value = '';

    }



    try {

      // Use the chatWithMeta function from our service

      const response = await chatWithMeta(currentInput.trim(), {

        model: MODEL_NAME,

        history: newMessages.slice(0, -1) // Pass all messages except the current user message as history

      });



      if (response.text) {

        setMessages([...newMessages, { role: 'model', content: response.text }]);

      } else {

        throw new Error('No response text received from model.');

      }

    } catch (err: unknown) {

      console.error('Chat error:', err);

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      setError(`Error: ${errorMessage}. Is the backend server running?`);

      setMessages(messages); // Revert on error

    } finally {

      setIsLoading(false);

    }

  }, [isLoading, messages]);



  // --- Outline Generation Handler ---

  const handleGenerateOutline = async () => {

    console.log('handleGenerateOutline called', { userMessageCount, isLoadingOutline });

    setIsLoadingOutline(true);

    setError('');

    setOutline(null);



    try {

      const response = await fetch('/api/generate-outline', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          model: MODEL_NAME,

          history: messages // Send the *entire* conversation history

        })

      });



      const data = await response.json();

      if (!response.ok) {

        throw new Error(data.details || 'Failed to generate outline');

      }



      setOutline(data as PresentationOutline); // Save the structured JSON



    } catch (err: unknown) {

      console.error('Outline generation error:', err);

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      setError(`Outline Error: ${errorMessage}. Is the backend server running?`);

    } finally {

      setIsLoadingOutline(false);

    }

  };



  // --- Brand Kit Handlers ---

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {

    setLogoError('');

    const file = e.target.files?.[0];

    if (!file) return;



    if (file.type !== 'image/svg+xml' && file.type !== 'image/png') {

      setLogoError('Please upload a .svg or .png file.');

      return;

    }



    try {

      const base64String = await fileToBase64(file);

      setLogoBase64(base64String);

    } catch {

      setLogoError('Failed to read file.');

    }

  };



  // --- UPDATED: Final Presentation Generation Handler ---

  const handleGeneratePresentation = async () => {

    console.log('handleGeneratePresentation called', { outline: !!outline, isLoadingPresentation });

    if (!outline) {

      setError('Please generate an outline first.');

      return;

    }



    setIsLoadingPresentation(true);

    setError('');



    // This is the final payload!

    const presentationPayload = {

      outline,

      brandKit: {

        color: primaryColor,

        logo: logoBase64

      }

    };



    try {

      const response = await fetch('/api/generate-presentation', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify(presentationPayload)

      });



      if (!response.ok) {

        const errorText = await response.text();

        throw new Error(errorText || 'Failed to generate presentation');

      }

      // --- NEW: Handle file download directly ---

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');

      a.href = url;

      a.download = 'presentation.pptx';

      document.body.appendChild(a);

      a.click();

      document.body.removeChild(a);

      window.URL.revokeObjectURL(url);

      console.log('Presentation downloaded successfully!');






    } catch (err: unknown) {

      console.error('Presentation generation error:', err);

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      setError(`Generation Error: ${errorMessage}. Is the backend server running?`);

    } finally {

      setIsLoadingPresentation(false);

    }

  };

  // --- Debug Test Handler ---

  const handleDebugTest = async () => {

    console.log('handleDebugTest called');

    setIsLoadingDebugTest(true);

    setError('');

    setDebugErrors([]);

    setDebugWarnings([]);

    setDebugSlidesCreated(0);

    try {

      const response = await fetch('/api/generate-debug-test', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' }

      });

      if (!response.ok) {

        const errorText = await response.text();

        let errorData;

        try {

          errorData = JSON.parse(errorText);

        } catch {

          errorData = { error: errorText };

        }

        throw new Error(errorData.details || errorData.error || 'Failed to generate debug test presentation');

      }

      // Extract debug info from headers

      const errorsHeader = response.headers.get('X-Debug-Errors');

      const warningsHeader = response.headers.get('X-Debug-Warnings');

      const slidesHeader = response.headers.get('X-Debug-Slides-Created');

      if (errorsHeader) {

        try {

          const errors = JSON.parse(errorsHeader);

          setDebugErrors(errors);

          console.error('Debug test errors:', errors);

          if (errors.length > 0) {

            console.error('Error details:');

            errors.forEach((err: string, idx: number) => {

              console.error(`  ${idx + 1}. ${err}`);

            });

          }

        } catch (e) {

          console.error('Failed to parse errors header:', e);

        }

      }

      if (warningsHeader) {

        try {

          const warnings = JSON.parse(warningsHeader);

          setDebugWarnings(warnings);

          console.warn('Debug test warnings:', warnings);

        } catch (e) {

          console.error('Failed to parse warnings header:', e);

        }

      }

      if (slidesHeader) {

        setDebugSlidesCreated(parseInt(slidesHeader, 10));

      }

      // Download the file

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');

      a.href = url;

      a.download = 'debug-test-presentation.pptx';

      document.body.appendChild(a);

      a.click();

      document.body.removeChild(a);

      window.URL.revokeObjectURL(url);

      console.log('Debug test presentation downloaded successfully!');

      // Log summary

      console.log('--- DEBUG TEST SUMMARY ---');

      console.log(`Slides created: ${slidesHeader || 'unknown'}`);

      console.log(`Errors: ${errorsHeader ? JSON.parse(errorsHeader).length : 0}`);

      console.log(`Warnings: ${warningsHeader ? JSON.parse(warningsHeader).length : 0}`);

    } catch (err: unknown) {

      console.error('Debug test error:', err);

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      setError(`Debug Test Error: ${errorMessage}. Is the backend server running?`);

    } finally {

      setIsLoadingDebugTest(false);

    }

  };






  // --- Enhanced Liquid Glass Card Component ---

  const GlassCard = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (

    <div className={`

      relative rounded-2xl

      bg-white/20 border border-white/30

      backdrop-blur-[80px]

      shadow-[0_8px_32px_rgba(0,0,0,0.12)]

      before:absolute before:inset-0 before:rounded-2xl

      before:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),inset_0_-1px_0_0_rgba(255,255,255,0.1)]

      before:pointer-events-none

      ${className}

    `}>

      {children}

    </div>

  );



  return (

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* --- Column 1: Chat Interface --- */}

      <GlassCard className="h-[75vh] flex flex-col p-4">

        {/* Message Display Area */}

        <div className="flex-1 overflow-y-auto space-y-2.5 mb-3">

          {messages.map((msg, index) => (

            <div key={`msg-${index}-${msg.content.substring(0, 10)}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

              <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white/50 text-gray-900 backdrop-blur-sm border border-white/60'
              }`}>

                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>

              </div>

            </div>

          ))}

          {isLoading && <p className="animate-pulse text-white/90 text-sm pl-1">Thinking...</p>}

        </div>

        {/* Error Display */}

        {error && <p className="px-3 py-2 mb-2 text-red-200 text-sm font-medium bg-red-500/20 rounded-lg border border-red-300/30">{error}</p>}

        {/* Input Area */}

        <div className="pt-3 border-t border-white/20">

          <form onSubmit={handleSend} className="flex gap-2">

            <input 
              ref={inputRef}
              type="text" 
              placeholder="Tell the assistant your goal..." 
              className="flex-1 px-4 py-2 rounded-full border border-white/40 bg-white/25 text-gray-900 placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white/35 transition-all text-sm backdrop-blur-sm" 
              autoComplete="off"
              disabled={isLoading}
            />

            <button 
              type="submit"
              disabled={isLoading} 
              className="px-6 py-2 bg-blue-600 rounded-full text-white font-semibold shadow-lg hover:bg-blue-500 active:scale-95 transition-all disabled:bg-gray-500 disabled:opacity-50 text-sm"
            >
              Send
            </button>

          </form>

        </div>

      </GlassCard>



      {/* --- Column 2: Hub & Outline --- */}

      <div className="space-y-3">



        {/* Brand Kit Card */}

        <GlassCard className="p-4">

          <h2 className="text-sm font-bold text-white mb-3 tracking-wide">Brand Kit</h2>

          <div className="space-y-2.5">

            <input type="file" id="logo-upload" className="hidden" accept="image/svg+xml,image/png" onChange={handleLogoUpload} />

            <label htmlFor="logo-upload" className="w-full text-center px-3 py-2 bg-white/30 rounded-xl hover:bg-white/40 active:scale-[0.98] transition-all cursor-pointer block text-sm font-medium text-gray-800 border border-white/40">

              {logoBase64 ? '✅ Logo Uploaded' : 'Upload Logo (.svg, .png)'}

            </label>

            {logoError && <p className="text-red-300 text-xs bg-red-500/20 px-2 py-1 rounded">{logoError}</p>}

            <div className="flex items-center gap-2">

              <label htmlFor="primary-color" className="text-white text-sm font-medium">Primary Color:</label>

              <input type="text" id="primary-color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="px-3 py-1.5 w-32 rounded-lg border border-white/40 bg-white/25 text-gray-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 backdrop-blur-sm" />

            </div>

          </div>

        </GlassCard>



        {/* Generation Hub */}

        <GlassCard className="p-4">

          <h2 className="text-sm font-bold text-white mb-3 tracking-wide">Generation Hub</h2>

          <div className="space-y-2">

            <button onClick={handleGenerateOutline} disabled={userMessageCount === 0 || isLoadingOutline} className="w-full px-4 py-2.5 bg-green-600 rounded-full text-white font-semibold shadow-lg hover:bg-green-500 active:scale-[0.98] transition-all disabled:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm">

              {isLoadingOutline ? 'Generating Outline...' : 'Step 1: Generate Outline'}

            </button>

            <button onClick={handleGeneratePresentation} disabled={!outline || isLoadingPresentation} className="w-full px-4 py-2.5 bg-purple-600 rounded-full text-white font-semibold shadow-lg hover:bg-purple-500 active:scale-[0.98] transition-all disabled:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm">

              {isLoadingPresentation ? 'Generating...' : 'Step 2: Generate Presentation'}

            </button>

            <div className="pt-2 border-t border-white/20 mt-2">

              <button onClick={handleDebugTest} disabled={isLoadingDebugTest} className="w-full px-4 py-2.5 bg-orange-600 rounded-full text-white font-semibold shadow-lg hover:bg-orange-500 active:scale-[0.98] transition-all disabled:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm">

                {isLoadingDebugTest ? 'Testing...' : '🔧 Debug Test Presentation'}

              </button>

            </div>

          </div>

        </GlassCard>

        {/* Debug Test Results */}

        {(debugErrors.length > 0 || debugWarnings.length > 0 || debugSlidesCreated > 0) && (

          <GlassCard className="p-4">

            <h3 className="text-sm font-bold text-white mb-3 tracking-wide">Debug Test Results</h3>

            <div className="space-y-2">

              {debugSlidesCreated > 0 && (

                <div className="text-xs text-green-300 bg-green-500/20 px-3 py-2 rounded-lg border border-green-500/30">

                  ✓ {debugSlidesCreated} slides created successfully

                </div>

              )}

              {debugErrors.length > 0 && (

                <div className="text-xs text-red-300 bg-red-500/20 px-3 py-2 rounded-lg border border-red-500/30">

                  <div className="font-bold mb-1">✗ Errors ({debugErrors.length}):</div>

                  <ul className="list-disc list-inside space-y-1">

                    {debugErrors.map((err, idx) => (

                      <li key={idx}>{err}</li>

                    ))}

                  </ul>

                </div>

              )}

              {debugWarnings.length > 0 && (

                <div className="text-xs text-yellow-300 bg-yellow-500/20 px-3 py-2 rounded-lg border border-yellow-500/30">

                  <div className="font-bold mb-1">⚠ Warnings ({debugWarnings.length}):</div>

                  <ul className="list-disc list-inside space-y-1">

                    {debugWarnings.map((warn, idx) => (

                      <li key={idx}>{warn}</li>

                    ))}

                  </ul>

                </div>

              )}

            </div>

          </GlassCard>

        )}






        {/* Outline Display Area */}

        {outline && ( // Show outline when available

          <GlassCard className="h-[35vh] flex flex-col p-4">

            <h3 className="text-sm font-bold text-white mb-3 tracking-wide">Generated Outline</h3>

            <div className="flex-1 overflow-y-auto p-3 bg-black/20 rounded-xl border border-white/20">

              <h4 className="text-sm font-bold text-white mb-2">{outline.title}</h4>

              <ul className="space-y-2 text-sm">

                {outline.slides.map((slide, index) => (

                  <li key={index} className="text-gray-100 pl-4 border-l-2 border-white/40">

                    <strong className="text-white font-semibold">{slide.title}:</strong>

                    <span className="text-gray-200 ml-1">{slide.content}</span>

                  </li>

                ))}

              </ul>

            </div>

          </GlassCard>

        )}

      </div>

    </div>

  );

}