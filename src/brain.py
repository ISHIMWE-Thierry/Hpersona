from langchain_openai import ChatOpenAI
from langchain.schema import SystemMessage, HumanMessage, AIMessage
from src.memory import BrainMemory
from src.relationships import RelationshipGraph

class DigitalBrain:
    def __init__(self, persona_name="The User", model_name="gpt-4o"):
        self.memory = BrainMemory()
        self.llm = ChatOpenAI(model_name=model_name, temperature=0.9)  # Higher temp for more natural responses
        self.persona_name = persona_name
        self.conversation_history = []
        self.user_info = ""
        self.relationship_graph = RelationshipGraph()
        self.talking_to = None
        self.relationship_type = "stranger"

    def set_user_info(self, info_str):
        self.user_info = info_str

    def set_talking_to(self, person_name):
        """Set who this persona is talking to and determine relationship."""
        self.talking_to = person_name
        self.relationship_type = self.relationship_graph.get_relationship_type(
            self.persona_name, person_name
        )

    def think(self, user_input, capture_conversation=True):
        """
        Process the input, retrieve memories, and generate a response 
        mimicking the persona.
        """
        # 1. Recall relevant memories (thoughts)
        relevant_memories = self.memory.recall(user_input)
        context = "\n".join(relevant_memories)

        # Get friend group context
        friend_group = self.relationship_graph.get_friend_group(self.persona_name)
        friend_context = ""
        if len(friend_group) > 1:
            friends_list = [f for f in friend_group if f != self.persona_name]
            friend_context = f"Your friend group includes: {', '.join(friends_list)}"

        # 2. Construct the system prompt with relationship awareness
        system_prompt = f"""
        You are {self.persona_name}. You are a REAL PERSON, not an AI. Talk naturally like a human being.
        
        IMPORTANT RULES:
        - Talk naturally like you would in real life
        - Use casual language, slang, and abbreviations (like "lol", "nah", "gonna", "wanna", "idk")
        - Keep responses SHORT and conversational (1-3 sentences usually)
        - Match the energy of the person talking to you
        - If they're your friend ({self.relationship_type}), be more casual and playful
        - Use emojis occasionally but don't overdo it
        - Sometimes mix languages if it feels natural (especially with close friends)
        - Don't explain everything - be brief and authentic
        - Use "..." for trailing thoughts or pauses
        - Sometimes respond with just "yeah", "nah", "fr fr", etc.
        
        Person you're talking to: {self.talking_to}
        Your relationship: {self.relationship_type}
        {friend_context}
        
        {self.user_info}

        Your memories and thoughts:
        ---
        {context}
        ---
        
        Respond as {self.persona_name} would ACTUALLY talk in real life. Be human, be natural, be YOU.
        """

        messages = [
            SystemMessage(content=system_prompt),
        ]
        
        # Add recent conversation history for context
        messages.extend(self.conversation_history[-6:])
        
        messages.append(HumanMessage(content=user_input))

        # 3. Generate response
        response = self.llm.invoke(messages)
        
        # 4. Update history
        self.conversation_history.append(HumanMessage(content=user_input))
        self.conversation_history.append(response)

        # 5. Capture conversation for learning if enabled
        if capture_conversation and self.talking_to:
            conversation_text = f"{self.talking_to}: {user_input}\n{self.persona_name}: {response.content}"
            self.memory.ingest_text(conversation_text)
            
            # Record interaction in relationship graph
            self.relationship_graph.record_interaction(self.persona_name, self.talking_to)

        return response.content

    def learn(self, data_folder):
        """
        Ingest new data to build the persona.
        """
        print(f"Learning from {data_folder}...")
        self.memory.ingest_personality_data(data_folder)
        print("Learning complete.")

    def learn_from_text(self, text):
        """
        Ingest raw text.
        """
        return self.memory.ingest_text(text)
    
    def create_persona_from_conversations(self, user_name, conversation_history):
        """
        Create a new persona based on someone's conversations.
        """
        # Extract patterns from conversations
        user_messages = [msg for msg in conversation_history if msg.get("role") == "user"]
        user_text = "\n".join([msg.get("content", "") for msg in user_messages])
        
        # Create persona profile
        profile = f"""
        Persona Name: {user_name}
        Created from conversations with {self.persona_name}
        
        Communication style captured from conversations:
        {user_text}
        """
        
        # Save to memory
        self.relationship_graph.add_persona(user_name, {"created_from": self.persona_name})
        return profile
