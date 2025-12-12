# Hpersona - Digital Immortality Through AI

Where memories live forever. Create digital personas that think, talk, and remember like real people.

## 🌟 Key Features

### 1. **Natural Conversations**
- Personas talk like real humans - casual, with slang, emojis, and natural language
- Responses adapt based on relationship (friends get more casual responses)
- Short, authentic replies instead of robotic explanations
- Mix languages naturally when appropriate

### 2. **Relationship Intelligence**
- **Automatic Learning**: Personas learn from every conversation
- **Relationship Tracking**: System tracks how often people interact
- **Friendship Levels**: 
  - Stranger → Acquaintance → Friend → Close Friend → Best Friend
  - Based on interaction count and conversation depth
- **Friend Groups**: Automatically detects social networks
  - If A talks to B, and B talks to C, they form a friend group
  - Personas know about mutual friends

### 3. **Persona Creation**
- **Manual Training**: Upload text files, journals, chat logs
- **Automatic Creation**: Create personas from conversation patterns
- **Multi-Persona System**: Multiple personas can coexist and interact

### 4. **Social Network View**
- Visualize all personas and their relationships
- See friend groups and connection strength
- Track interaction counts between personas

## 🚀 How It Works

### Training a Persona (Creator Mode)
1. Go to "Train Persona"
2. Enter the persona's name
3. Upload their writings, journals, or conversations
4. The AI learns their personality, speech patterns, and memories

### Talking to a Persona (User Mode)
1. Go to "Talk to Persona"
2. Select which persona to talk to
3. Enter your name
4. Enable "Auto-learn from chat" to let the persona learn from you
5. Start chatting naturally!

### Understanding Relationships
- **First conversation**: You're strangers
- **5+ interactions**: You become friends
- **20+ interactions**: Close friends
- **50+ interactions**: Best friends
- Personas adjust their tone based on relationship level

### Creating Personas from Conversations
1. Have conversations with an existing persona
2. Go to "Social Network"
3. Click "Create Persona from Conversations"
4. A new persona is created based on YOUR communication style

## 💡 Usage Tips

### For Natural Conversations
- Be casual! The AI responds better to natural language
- Use slang, abbreviations (lol, nah, fr, etc.)
- Keep messages short and conversational
- The persona will match your energy

### For Better Training
- Upload varied content (journals, chats, social media)
- Include first-person thoughts and feelings
- More authentic content = better personality replication
- Regular updates improve accuracy

### For Building Relationships
- Have regular conversations to strengthen bonds
- Enable auto-learning to let personas grow
- Different relationships unlock different conversation styles
- Friend groups share context about mutual connections

## 🎯 Use Cases

1. **Digital Legacy**: Preserve someone's personality and memories
2. **Therapy & Grief**: Talk to digital versions of lost loved ones
3. **Character Development**: Create realistic fictional characters
4. **Language Practice**: Practice conversations with AI personas
5. **Social Experiments**: Study relationship dynamics
6. **Personal Growth**: Reflect by talking to past versions of yourself

## 🔧 Technical Details

### Architecture
- **Vector Database**: ChromaDB for memory storage
- **LLM**: OpenAI GPT-4o with high temperature for natural responses
- **Relationship Graph**: JSON-based social network tracking
- **Auto-learning**: Conversations automatically update persona memories

### Data Storage
- `brain_storage/`: Vector embeddings of memories
- `relationships/`: Social graph and interaction history
- Each persona maintains separate memory space
- Conversations captured in real-time

## 🎨 UI Features

- Clean, modern design with Tailwind-inspired styling
- Three modes: Talk, Train, Social Network
- Real-time relationship status indicators
- Conversation auto-capture toggle
- Multi-persona selector
- Friend group visualization

## 🚦 Getting Started

1. Install dependencies:
   ```bash
   python3 -m pip install -r requirements.txt
   ```

2. Set up your OpenAI API key in `.env`:
   ```
   OPENAI_API_KEY=your_key_here
   ```

3. Run the app:
   ```bash
   python3 -m streamlit run app.py
   ```

4. Create your first persona by training it with text
5. Start chatting and watch relationships grow!

## 🔮 Future Enhancements

- Group conversations (multiple personas chatting together)
- Voice cloning integration
- Video avatar generation
- Emotion detection and response
- Multi-language support
- Export/import persona profiles
- Privacy controls and data encryption

## ⚠️ Privacy & Ethics

- All data stored locally
- No data shared without consent
- Respect the memory of real people
- Use responsibly and ethically
- Consider consent before creating personas of others

---

**Built with ❤️ for preserving human connections**
