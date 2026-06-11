
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  initAudioContext, 
  decodeAudioFile, 
  playAudioSegment, 
  sliceAudioBuffer, 
  bufferToWav,
  createMutron,
  createLFOFilter,
  MutronNodes,
  LFOFilterNodes
} from './services/audioService';
import WaveformDisplay from './components/WaveformDisplay';
import { Marker } from './types';

const MAX_MARKERS = 16;
const DEFAULT_SAMPLE_DURATION = 1.5;
const MIN_SAMPLE_DURATION = 0.05;
const MAX_UI_SAMPLE_DURATION = 15;

const keyboardMap: { [key: string]: number } = {
  'q': 0, 'w': 1, 'e': 2, 'r': 3, 't': 4, 'y': 5, 'u': 6, 'i': 7,
  'a': 8, 's': 9, 'd': 10, 'f': 11, 'g': 12, 'h': 13, 'j': 14, 'k': 15,
};

function App() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const recorderDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const currentSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const recordedPlaybackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Effect Refs
  const mutronRef = useRef<MutronNodes | null>(null);
  const lfoRef = useRef<LFOFilterNodes | null>(null);

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [masterVolume, setMasterVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [pitchShift, setPitchShift] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Effect States
  const [mutronActive, setMutronActive] = useState(false);
  const [mutronSensitivity, setMutronSensitivity] = useState(5);
  const [mutronDepth, setMutronDepth] = useState(2000);
  
  const [lfoActive, setLfoActive] = useState(false);
  const [lfoRate, setLfoRate] = useState(1);
  const [lfoDepth, setLfoDepth] = useState(500);

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBuffer, setRecordedBuffer] = useState<AudioBuffer | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(100);
  const [recZoom, setRecZoom] = useState(1);

  useEffect(() => {
    try {
      const ctx = initAudioContext();
      audioContextRef.current = ctx;
      
      const gain = ctx.createGain();
      gain.gain.value = masterVolume;
      gainNodeRef.current = gain;

      const dest = ctx.createMediaStreamDestination();
      gain.connect(dest);
      gain.connect(ctx.destination);
      recorderDestRef.current = dest;

      // Initialize Effects
      const mutron = createMutron(ctx);
      const lfo = createLFOFilter(ctx);
      
      mutronRef.current = mutron;
      lfoRef.current = lfo;

      // Connect Chain: Mutron -> LFO -> MasterGain
      mutron.output.connect(lfo.input);
      lfo.output.connect(gain);

    } catch (e: any) {
      setError(`Web Audio API not supported: ${e.message}`);
    }

    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = masterVolume;
    }
  }, [masterVolume]);

  // Update Effects
  useEffect(() => {
    if (!mutronRef.current || !audioContextRef.current) return;
    const { filter, sensitivity, depth } = mutronRef.current;
    const now = audioContextRef.current.currentTime;

    if (mutronActive) {
      filter.frequency.setTargetAtTime(200, now, 0.1);
      sensitivity.gain.setTargetAtTime(mutronSensitivity, now, 0.1);
      depth.gain.setTargetAtTime(mutronDepth, now, 0.1);
    } else {
      filter.frequency.setTargetAtTime(22000, now, 0.1); // Bypass (open filter)
      sensitivity.gain.setTargetAtTime(0, now, 0.1);
      depth.gain.setTargetAtTime(0, now, 0.1);
    }
  }, [mutronActive, mutronSensitivity, mutronDepth]);

  useEffect(() => {
    if (!lfoRef.current || !audioContextRef.current) return;
    const { filter, lfo, depth } = lfoRef.current;
    const now = audioContextRef.current.currentTime;

    if (lfoActive) {
      filter.frequency.setTargetAtTime(1000, now, 0.1);
      lfo.frequency.setTargetAtTime(lfoRate, now, 0.1);
      depth.gain.setTargetAtTime(lfoDepth, now, 0.1);
    } else {
      filter.frequency.setTargetAtTime(22000, now, 0.1); // Bypass
      depth.gain.setTargetAtTime(0, now, 0.1);
    }
  }, [lfoActive, lfoRate, lfoDepth]);

  const resumeAudioContext = useCallback(async () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch (e: any) {
        setError(`Failed to resume audio context: ${e.message}`);
      }
    }
  }, []);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!audioContextRef.current) return;

    setIsLoading(true);
    setError(null);
    setAudioBuffer(null);
    setMarkers([]);
    setSelectedMarkerId(null);
    setFileName(file.name);
    setZoomLevel(1);

    await resumeAudioContext();

    try {
      const buffer = await decodeAudioFile(audioContextRef.current, file);
      setAudioBuffer(buffer);
    } catch (e: any) {
      setError(e.message || "Failed to load audio file.");
    } finally {
      setIsLoading(false);
    }
  }, [resumeAudioContext]);

  const saveLayout = useCallback(() => {
    if (!fileName) return;
    const layout = {
      sourceFile: fileName,
      markers: markers,
      timestamp: Date.now()
    };
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.split('.')[0]}_layout.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fileName, markers]);

  const loadLayout = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.sourceFile !== fileName) {
          setError(`File mismatch: Layout is for "${json.sourceFile}" but current file is "${fileName}"`);
          return;
        }
        setMarkers(json.markers);
        setError(null);
      } catch (err) {
        setError("Invalid JSON layout file.");
      }
    };
    reader.readAsText(file);
    // Clear input
    event.target.value = '';
  }, [fileName]);

  const startRecording = useCallback(async () => {
    if (!recorderDestRef.current) return;
    await resumeAudioContext();

    const recorder = new MediaRecorder(recorderDestRef.current.stream);
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      if (audioContextRef.current) {
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        setRecordedBuffer(buffer);
        setTrimStart(0);
        setTrimEnd(100);
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
    setRecordedBuffer(null);
  }, [resumeAudioContext]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const addMarker = useCallback((position: number) => {
    if (markers.length < MAX_MARKERS && audioBuffer) {
      const newMarkerId = `marker-${Date.now()}`;
      setMarkers((prevMarkers) => [
        ...prevMarkers,
        { id: newMarkerId, position, sampleDuration: DEFAULT_SAMPLE_DURATION },
      ].sort((a, b) => a.position - b.position));
      setSelectedMarkerId(newMarkerId);
    }
  }, [markers, audioBuffer]);

  const removeMarker = useCallback((id: string) => {
    setMarkers((prevMarkers) => prevMarkers.filter((m) => m.id !== id));
    if (selectedMarkerId === id) setSelectedMarkerId(null);
  }, [selectedMarkerId]);

  const handleMarkerDrag = useCallback((id: string, newPosition: number) => {
    setMarkers((prevMarkers) =>
      prevMarkers
        .map((marker) =>
          marker.id === id ? { ...marker, position: newPosition } : marker
        )
        .sort((a, b) => a.position - b.position)
    );
    setSelectedMarkerId(id);
  }, []);

  const handleRecMarkerDrag = useCallback((id: string, newPosition: number) => {
    if (id === 'trim-start') setTrimStart(newPosition);
    if (id === 'trim-end') setTrimEnd(newPosition);
  }, []);

  const playSample = useCallback(async (marker: Marker) => {
    if (!audioBuffer || !audioContextRef.current || !gainNodeRef.current) return;
    await resumeAudioContext();

    if (currentSourceNodeRef.current) {
      currentSourceNodeRef.current.stop();
      currentSourceNodeRef.current = null;
    }

    const startOffset = (marker.position / 100) * audioBuffer.duration;
    const duration = marker.sampleDuration;
    const detuneCents = pitchShift * 100;

    try {
      // Route through Mutron Input (start of effects chain) if available, otherwise Master Gain
      const destination = mutronRef.current ? mutronRef.current.input : gainNodeRef.current;
      
      const source = playAudioSegment(
        audioContextRef.current,
        audioBuffer,
        startOffset,
        duration,
        destination,
        playbackSpeed,
        detuneCents,
      );
      currentSourceNodeRef.current = source;
    } catch (e: any) {
      setError(`Error playing sample: ${e.message}`);
    }
  }, [audioBuffer, resumeAudioContext, playbackSpeed, pitchShift]);

  const playRecordedTrimmed = useCallback(async () => {
    if (!recordedBuffer || !audioContextRef.current || !gainNodeRef.current) return;
    await resumeAudioContext();

    if (recordedPlaybackSourceRef.current) {
      recordedPlaybackSourceRef.current.stop();
    }

    const start = (trimStart / 100) * recordedBuffer.duration;
    const end = (trimEnd / 100) * recordedBuffer.duration;
    const duration = Math.max(0, end - start);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = recordedBuffer;
    source.connect(gainNodeRef.current);
    source.start(0, start, duration);
    recordedPlaybackSourceRef.current = source;
  }, [recordedBuffer, trimStart, trimEnd, resumeAudioContext]);

  const saveTrimmed = useCallback(() => {
    if (!recordedBuffer || !audioContextRef.current) return;
    
    const start = (trimStart / 100) * recordedBuffer.duration;
    const end = (trimEnd / 100) * recordedBuffer.duration;
    
    const sliced = sliceAudioBuffer(audioContextRef.current, recordedBuffer, start, end);
    const wavBlob = bufferToWav(sliced);
    
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trimmed_sample_${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }, [recordedBuffer, trimStart, trimEnd]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const markerIndex = keyboardMap[key];
      if (markerIndex !== undefined && audioBuffer && markers.length > markerIndex) {
        event.preventDefault();
        const markerToPlay = markers[markerIndex];
        setSelectedMarkerId(markerToPlay.id);
        playSample(markerToPlay);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [markers, audioBuffer, playSample]);

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-gray-900 text-white p-4 overflow-y-auto">
      <h1 className="text-4xl font-extrabold mb-8 text-blue-400">Trois Sampler</h1>

      {error && (
        <div className="bg-red-600 p-3 rounded-lg text-sm mb-4 w-full max-w-4xl text-center flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 font-bold">×</button>
        </div>
      )}

      <div className="mb-6 flex flex-col items-center">
        <label htmlFor="audio-upload" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg cursor-pointer transition-colors duration-200">
          {fileName ? `Change Audio: ${fileName}` : 'Upload Audio File'}
        </label>
        <input id="audio-upload" type="file" accept="audio/*" onChange={handleFileChange} className="hidden" disabled={isLoading} />
        {isLoading && <p className="mt-2 text-blue-300">Loading audio...</p>}
      </div>

      {audioBuffer && (
        <div className="w-full max-w-4xl mb-8 flex flex-col items-center">
          <div className="w-full overflow-x-auto rounded-lg shadow-md bg-gray-800 border border-gray-700 custom-scrollbar" style={{ height: '200px' }}>
            <WaveformDisplay
              audioBuffer={audioBuffer} markers={markers} onMarkerDrag={handleMarkerDrag}
              onWaveformClick={addMarker} onMarkerClick={setSelectedMarkerId}
              waveformHeight={200} selectedMarkerId={selectedMarkerId}
              zoomLevel={zoomLevel}
            />
          </div>

          <div className="flex flex-wrap justify-center items-center mt-4 gap-4">
            <button onClick={() => addMarker(50)} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md" disabled={markers.length >= MAX_MARKERS}>
              Add Marker ({markers.length}/{MAX_MARKERS})
            </button>
            {selectedMarkerId && (
              <button onClick={() => removeMarker(selectedMarkerId)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-md">Remove Selected</button>
            )}
            <button onClick={() => { setMarkers([]); setSelectedMarkerId(null); }} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg shadow-md">Clear All</button>
            
            <div className="h-8 w-px bg-gray-700 mx-2"></div>

            <button onClick={saveLayout} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              Save Layout
            </button>
            
            <label className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md flex items-center gap-2 cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Load Layout
              <input type="file" accept=".json" onChange={loadLayout} className="hidden" />
            </label>

            <button 
              onClick={isRecording ? stopRecording : startRecording} 
              className={`font-bold py-2 px-6 rounded-lg transition-all ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-red-700 hover:bg-red-800'} shadow-lg`}
            >
              {isRecording ? 'STOP RECORDING' : 'RECORD OUTPUT'}
            </button>
          </div>

          <div className="mt-6 w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
               <div className="flex items-center space-x-2">
                <label className="text-sm min-w-[80px] text-gray-400">Volume:</label>
                <input type="range" min="0" max="1" step="0.01" value={masterVolume} onChange={(e) => setMasterVolume(parseFloat(e.target.value))} className="flex-1" />
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm min-w-[80px] text-gray-400">Tempo:</label>
                <input type="range" min="0.5" max="2.0" step="0.01" value={playbackSpeed} onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))} className="flex-1" />
                <span className="text-xs w-8 text-blue-300">{playbackSpeed.toFixed(2)}x</span>
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm min-w-[80px] text-gray-400">Pitch:</label>
                <input type="range" min="-12" max="12" step="1" value={pitchShift} onChange={(e) => setPitchShift(parseInt(e.target.value, 10))} className="flex-1" />
                <span className="text-xs w-8 text-blue-300">{pitchShift > 0 ? `+${pitchShift}` : pitchShift}st</span>
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm min-w-[80px] text-gray-400">Zoom:</label>
                <input type="range" min="1" max="15" step="0.1" value={zoomLevel} onChange={(e) => setZoomLevel(parseFloat(e.target.value))} className="flex-1" />
                <span className="text-xs w-8 text-blue-300">{zoomLevel.toFixed(1)}x</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-inner">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Mutron (Auto-Wah)</h3>
                  <label className="inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={mutronActive} onChange={(e) => setMutronActive(e.target.checked)} className="sr-only peer" />
                    <div className="relative w-9 h-5 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
                <div className={`space-y-2 transition-opacity duration-200 ${mutronActive ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                  <div className="flex items-center space-x-2">
                    <label className="text-xs min-w-[60px] text-gray-400">Sens:</label>
                    <input type="range" min="0" max="20" step="0.1" value={mutronSensitivity} onChange={(e) => setMutronSensitivity(parseFloat(e.target.value))} className="flex-1 accent-purple-500" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <label className="text-xs min-w-[60px] text-gray-400">Depth:</label>
                    <input type="range" min="0" max="5000" step="10" value={mutronDepth} onChange={(e) => setMutronDepth(parseFloat(e.target.value))} className="flex-1 accent-purple-500" />
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-inner">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-semibold text-pink-400 uppercase tracking-wider">LFO Filter</h3>
                  <label className="inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={lfoActive} onChange={(e) => setLfoActive(e.target.checked)} className="sr-only peer" />
                    <div className="relative w-9 h-5 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-pink-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600"></div>
                  </label>
                </div>
                <div className={`space-y-2 transition-opacity duration-200 ${lfoActive ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                  <div className="flex items-center space-x-2">
                    <label className="text-xs min-w-[60px] text-gray-400">Rate:</label>
                    <input type="range" min="0.1" max="20" step="0.1" value={lfoRate} onChange={(e) => setLfoRate(parseFloat(e.target.value))} className="flex-1 accent-pink-500" />
                    <span className="text-[10px] w-8 text-right text-gray-400">{lfoRate.toFixed(1)}Hz</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <label className="text-xs min-w-[60px] text-gray-400">Depth:</label>
                    <input type="range" min="0" max="5000" step="10" value={lfoDepth} onChange={(e) => setLfoDepth(parseFloat(e.target.value))} className="flex-1 accent-pink-500" />
                  </div>
                </div>
              </div>
            </div>

            {selectedMarkerId && (
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-inner">
                <h3 className="text-sm font-semibold text-blue-300 mb-3 uppercase tracking-wider">Marker Settings</h3>
                <div className="flex items-center space-x-2">
                  <label className="text-sm min-w-[60px] text-gray-400">Length:</label>
                  <input type="range" min={MIN_SAMPLE_DURATION} max={Math.min(audioBuffer.duration, MAX_UI_SAMPLE_DURATION)} step="0.05" 
                         value={markers.find(m => m.id === selectedMarkerId)?.sampleDuration || DEFAULT_SAMPLE_DURATION} 
                         onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setMarkers(m => m.map(marker => marker.id === selectedMarkerId ? { ...marker, sampleDuration: val } : marker));
                         }} className="flex-1" />
                  <span className="text-xs w-10 text-blue-300">{(markers.find(m => m.id === selectedMarkerId)?.sampleDuration || 0).toFixed(2)}s</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {audioBuffer && (
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3 w-full max-w-4xl p-4 bg-gray-800 rounded-xl shadow-2xl border border-gray-700 mb-12">
          {Array.from({ length: MAX_MARKERS }).map((_, index) => {
            const marker = markers[index];
            const isAssigned = !!marker;
            const keyLabel = Object.keys(keyboardMap).find(key => keyboardMap[key] === index)?.toUpperCase() || '';
            const isActive = selectedMarkerId === marker?.id;
            return (
              <button key={index}
                className={`relative flex flex-col items-center justify-center h-16 w-16 md:h-20 md:w-20 rounded-lg text-sm font-bold transition-all
                            ${isAssigned ? (isActive ? 'bg-yellow-500 text-gray-900 scale-105 ring-2 ring-yellow-300 shadow-yellow-500/50' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/30') : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'}
                            shadow-md active:translate-y-0.5`}
                onClick={() => { if (isAssigned) { setSelectedMarkerId(marker.id); playSample(marker); } }} disabled={!isAssigned}>
                <span>{index + 1}</span>
                <span className="text-[10px] opacity-75">{keyLabel}</span>
                {isAssigned && <span className="absolute bottom-1 text-[9px] font-normal">{marker.sampleDuration.toFixed(1)}s</span>}
              </button>
            );
          })}
        </div>
      )}

      {recordedBuffer && (
        <div className="w-full max-w-4xl mt-4 p-6 bg-gray-800 rounded-2xl shadow-2xl border border-blue-900 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h2 className="text-2xl font-bold mb-4 text-blue-300 flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span> Recorded Output
          </h2>
          
          <div className="w-full overflow-x-auto rounded-lg bg-black border border-gray-700 custom-scrollbar" style={{ height: '150px' }}>
            <WaveformDisplay
              audioBuffer={recordedBuffer}
              markers={[
                { id: 'trim-start', position: trimStart, sampleDuration: 0 },
                { id: 'trim-end', position: trimEnd, sampleDuration: 0 }
              ]}
              onMarkerDrag={handleRecMarkerDrag}
              onWaveformClick={() => {}}
              onMarkerClick={() => {}}
              waveformHeight={150}
              selectedMarkerId={null}
              zoomLevel={recZoom}
            />
          </div>

          <div className="mt-6 flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1 w-full space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-xs min-w-[70px] uppercase font-bold text-gray-400">Trim Start:</label>
                <input type="range" min="0" max={trimEnd - 1} value={trimStart} onChange={(e) => setTrimStart(parseFloat(e.target.value))} className="flex-1 accent-green-500" />
                <span className="text-xs w-10 text-right text-green-400">{trimStart.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs min-w-[70px] uppercase font-bold text-gray-400">Trim End:</label>
                <input type="range" min={trimStart + 1} max="100" value={trimEnd} onChange={(e) => setTrimEnd(parseFloat(e.target.value))} className="flex-1 accent-red-500" />
                <span className="text-xs w-10 text-right text-red-400">{trimEnd.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs min-w-[70px] uppercase font-bold text-gray-400">Zoom:</label>
                <input type="range" min="1" max="15" step="0.1" value={recZoom} onChange={(e) => setRecZoom(parseFloat(e.target.value))} className="flex-1" />
                <span className="text-xs w-10 text-right text-blue-300">{recZoom.toFixed(1)}x</span>
              </div>
            </div>

            <div className="flex gap-4">
              <button onClick={playRecordedTrimmed} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-transform hover:scale-105 active:scale-95">
                PLAY SELECTION
              </button>
              <button onClick={saveTrimmed} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-transform hover:scale-105 active:scale-95">
                SAVE AS WAV
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #1f2937; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
      `}} />
    </div>
  );
}

export default App;
