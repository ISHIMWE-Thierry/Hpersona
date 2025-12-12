import os
from langchain_community.vectorstores import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import TextLoader, DirectoryLoader

class BrainMemory:
    def __init__(self, persist_directory="./brain_storage"):
        self.persist_directory = persist_directory
        self.embedding_function = OpenAIEmbeddings()
        
        # Initialize or load the vector store
        if os.path.exists(persist_directory):
            self.vector_store = Chroma(
                persist_directory=self.persist_directory, 
                embedding_function=self.embedding_function
            )
        else:
            self.vector_store = Chroma(
                persist_directory=self.persist_directory, 
                embedding_function=self.embedding_function
            )

    def ingest_personality_data(self, data_path):
        """
        Reads text files from the data_path to learn about the person.
        """
        if not os.path.exists(data_path):
            print(f"Data path {data_path} does not exist.")
            return

        loader = DirectoryLoader(data_path, glob="**/*.txt", loader_cls=TextLoader)
        documents = loader.load()
        
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        texts = text_splitter.split_documents(documents)
        
        if texts:
            self.vector_store.add_documents(texts)
            print(f"Absorbed {len(texts)} new thoughts into the brain.")
        else:
            print("No new thoughts found to absorb.")

    def ingest_text(self, text_content):
        """
        Ingests raw text directly into memory.
        """
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        texts = text_splitter.create_documents([text_content])
        
        if texts:
            self.vector_store.add_documents(texts)
            return len(texts)
        return 0

    def recall(self, query, k=4):
        """
        Retrieves relevant memories or thoughts based on a query.
        """
        results = self.vector_store.similarity_search(query, k=k)
        return [doc.page_content for doc in results]
