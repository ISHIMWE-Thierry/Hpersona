"""
Hpersona System Architecture

1. MEMORY SYSTEM (memory.py)
   - Vector database storage using ChromaDB
   - Stores memories as embeddings
   - Retrieval-Augmented Generation (RAG)
   - Methods:
     * ingest_personality_data() - Load from files
     * ingest_text() - Add raw text
     * recall() - Semantic search for relevant memories

2. BRAIN SYSTEM (brain.py)
   - Main persona intelligence
   - Uses GPT-4o with high temperature (0.9) for natural responses
   - Features:
     * Natural language generation
     * Relationship awareness
     * Conversation capture
     * Dynamic tone adjustment
   - Methods:
     * think() - Generate responses
     * learn_from_text() - Ingest new information
     * create_persona_from_conversations() - Create new personas

3. RELATIONSHIP SYSTEM (relationships.py)
   - Social graph management
   - Tracks interactions between personas
   - Automatic friendship level calculation
   - Friend group detection using DFS
   - Types: stranger → acquaintance → friend → close_friend → best_friend
   - Methods:
     * add_persona() - Register new persona
     * record_interaction() - Log conversation
     * get_friends() - Get persona's connections
     * get_friend_group() - Find social network
     * get_relationship_type() - Check relationship level

4. UI SYSTEM (app.py)
   - Three main modes:
     A. Talk to Persona
        - Chat interface
        - Relationship status display
        - Auto-learning toggle
        - Real-time conversation capture
     
     B. Train Persona
        - Text input form
        - File upload system
        - Training guide
        - Persona configuration
     
     C. Social Network
        - Persona list
        - Relationship visualization
        - Friend group display
        - Persona creation from conversations

DATA FLOW:
1. User sends message
2. Brain recalls relevant memories from vector DB
3. Brain checks relationship level
4. Brain generates context-aware, natural response
5. If auto-learn enabled:
   - Conversation saved to memory
   - Relationship graph updated
   - Interaction count incremented
   - Friendship level recalculated

RELATIONSHIP PROGRESSION:
- 0 interactions: Stranger
- 1-4 interactions: Acquaintance  
- 5-20 interactions: Friend
- 21-50 interactions: Close Friend
- 51+ interactions: Best Friend

FRIEND GROUP DETECTION:
- Uses Depth-First Search (DFS)
- Finds all connected personas
- Example: A talks to B, B talks to C → {A, B, C} is a friend group
- Personas in same group share context about mutual friends

PERSONA CREATION FROM CONVERSATIONS:
1. Extract user messages from conversation history
2. Analyze communication patterns
3. Create persona profile with user's style
4. Save to memory system
5. Register in relationship graph
"""
