export function toUserFriendlyTranscriptionError(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();

  if (
    normalized.includes('output file does not contain any stream') ||
    (normalized.includes('stream map') && normalized.includes('matches no streams')) ||
    normalized.includes('no audio stream')
  ) {
    return 'No audio track found in this file. Please choose a file that contains audio.';
  }

  if (normalized.includes('ffmpeg not found')) {
    return 'FFmpeg is not available. Install FFmpeg and try again.';
  }

  if (normalized.includes('input file not found')) {
    return 'Input file not found. Make sure the file still exists and try again.';
  }

  return errorMessage;
}
