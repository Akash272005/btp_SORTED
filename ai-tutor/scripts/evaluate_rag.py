import os
import sys
import json
import asyncio
from dotenv import load_dotenv
import pandas as pd
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import Faithfulness, AnswerRelevancy
from langchain_openai import AzureChatOpenAI, AzureOpenAIEmbeddings

# Add root directory to python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.services.rag.service import RAGService

# Load environment variables
load_dotenv()

# Test queries for Class 12 Physics (Chapter 1: Electric Charges and Fields)
TEST_QUERIES = [
    "What is Gauss's Law in electrostatics?",
    "What is Coulomb's Law?",
    "Define electric flux.",
    "How is the electric field defined?",
    "What are the basic properties of electric charge?"
]

KB_NAME = "class_12_physics"

async def run_evaluation():
    print(f"Starting RAG Evaluation for Knowledge Base: {KB_NAME}")
    
    # 1. Initialize RAG Service with llamaindex provider since raganything is missing
    rag_service = RAGService(provider="llamaindex")
    
    # 2. Configure Azure OpenAI for Ragas
    llm_host = os.getenv("LLM_HOST", "")
    base_llm_url = llm_host.split("/openai")[0] if "/openai" in llm_host else llm_host
    
    class PatchedAzureChatOpenAI(AzureChatOpenAI):
        def invoke(self, *args, **kwargs):
            kwargs["temperature"] = 1
            return super().invoke(*args, **kwargs)
        def generate(self, *args, **kwargs):
            if hasattr(self, 'temperature'):
                self.temperature = 1
            # Langchain's generate handles params differently, we force it in the dict
            return super().generate(*args, **kwargs)
        async def agenerate(self, *args, **kwargs):
            kwargs["temperature"] = 1
            return await super().agenerate(*args, **kwargs)
            
    llm = PatchedAzureChatOpenAI(
        azure_endpoint=base_llm_url,
        api_key=os.getenv("LLM_API_KEY"),
        api_version=os.getenv("LLM_API_VERSION"),
        deployment_name=os.getenv("LLM_MODEL", "gpt-5.2-chat"),
        temperature=1
    )
    
    emb_host = os.getenv("EMBEDDING_HOST", "")
    base_emb_url = emb_host.split("/openai")[0] if "/openai" in emb_host else emb_host
    
    embeddings = AzureOpenAIEmbeddings(
        azure_endpoint=base_emb_url,
        api_key=os.getenv("EMBEDDING_API_KEY"),
        api_version=os.getenv("EMBEDDING_API_VERSION", "2024-08-01-preview"),
        deployment=os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    )

    data = {
        "question": [],
        "answer": [],
        "contexts": []
    }

    # 3. Retrieve and Generate
    print("\n[1/3] Generating answers and retrieving contexts...")
    for query in TEST_QUERIES:
        print(f"  - Query: {query}")
        try:
            result = await rag_service.search(query, kb_name=KB_NAME, mode="hybrid")
            
            answer = result.get("answer", "")
            
            # Extract contexts depending on how RAGService returns them
            contexts = []
            if "chunks" in result:
                for chunk in result["chunks"]:
                    if isinstance(chunk, dict) and "text" in chunk:
                        contexts.append(chunk["text"])
                    elif isinstance(chunk, str):
                        contexts.append(chunk)
            elif "content" in result:
                contexts.append(result["content"])
                
            data["question"].append(query)
            data["answer"].append(answer)
            data["contexts"].append(contexts)
            
        except Exception as e:
            print(f"  ! Error on query '{query}': {e}")
            
    # 4. Create Dataset
    print("\n[2/3] Building Ragas dataset...")
    dataset = Dataset.from_dict(data)
    
    # 5. Evaluate
    print("\n[3/3] Running Ragas Evaluation...")
    
    metrics = [
        Faithfulness(),
        AnswerRelevancy()
    ]
    
    results = evaluate(
        dataset,
        metrics=metrics,
        llm=llm,
        embeddings=embeddings
    )
    
    # 6. Save results
    df = results.to_pandas()
    print("\n=== Evaluation Results ===")
    print(df.head())
    
    # Calculate aggregate scores from the dataframe for metric columns
    # In Ragas v0.4, metric columns are typically appended to the dataframe
    metric_cols = [col for col in df.columns if col not in ['question', 'user_input', 'answer', 'response', 'contexts', 'retrieved_contexts']]
    
    # Convert dataframe to markdown
    md_content = "# RAG Evaluation Results: Class 12 Physics\n\n"
    md_content += "## Aggregate Scores\n"
    for m in metric_cols:
        score = df[m].mean()
        md_content += f"- **{m}**: {score:.4f}\n"
        
    md_content += "\n## Detailed Results\n"
    md_content += df.to_markdown(index=False)
    
    with open("rag_evaluation_results.md", "w", encoding="utf-8") as f:
        f.write(md_content)
        
    print("\nResults saved to rag_evaluation_results.md")

if __name__ == "__main__":
    asyncio.run(run_evaluation())
