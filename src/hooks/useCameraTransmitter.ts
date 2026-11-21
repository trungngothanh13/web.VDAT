export type TransmitterSourceType = 'none' | 'video_file' | 'laptop_webcam';

export interface VideoInputDevice {
  deviceId: string;
  label: string;
}
