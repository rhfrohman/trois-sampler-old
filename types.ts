
export interface Marker {
  id: string;
  position: number; // Percentage from 0 to 100
  sampleDuration: number; // Duration of the sample in seconds (e.g., 1.5 seconds)
}
