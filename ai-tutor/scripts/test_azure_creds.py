
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv

async def test_azure():
    project_root = Path(__file__).parent.parent
    load_dotenv(project_root / ".env")
    
    from src.services.llm import complete
    
    print("Testing Azure OpenAI connection...")
    try:
        response = await complete(
            prompt="Say 'Azure is working!'",
            system_prompt="You are a helpful assistant.",
            model=os.getenv("LLM_MODEL"),
            api_key=os.getenv("LLM_API_KEY"),
            base_url=os.getenv("LLM_HOST")
        )
        print(f"Response: {response}")
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    asyncio.run(test_azure())
