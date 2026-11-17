import logging
from src.services.video.video_transcriber import fetch_transcript

logger = logging.getLogger(__name__)

async def analyze_video_tool(url: str) -> dict:
    """Tool wrapper to fetch and return video transcript."""
    logger.info(f"Analyzing video URL: {url}")
    result = fetch_transcript(url)
    
    if not result.get("success"):
        error_msg = result.get("error", "Unknown error fetching transcript")
        logger.warning(f"Failed to fetch transcript: {error_msg}")
        return {
            "answer": f"Error extracting video transcript: {error_msg}. Note that some videos may have transcripts disabled or restricted.",
            "video_id": result.get("video_id")
        }
        
    transcript = result.get("text", "")
    
    # Cap transcript length slightly if too long
    max_length = 15000
    if len(transcript) > max_length:
        transcript = transcript[:max_length] + "... [Transcript truncated due to length]"
        
    return {
        "answer": f"Video Transcript:\\n\\n{transcript}",
        "video_id": result.get("video_id"),
        "title": "YouTube Video"
    }
