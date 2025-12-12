import streamlit as st
import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain.schema import HumanMessage, AIMessage, SystemMessage
import time

# Load environment variables
load_dotenv()

# Check if Firebase is configured
FIREBASE_ENABLED = os.path.exists('firebase_config.json')
if FIREBASE_ENABLED:
    try:
        from firebase_manager import FirebaseManager
        FirebaseManager.initialize()
    except Exception as e:
        FIREBASE_ENABLED = False
        st.warning("⚠️ Firebase not configured. Running in local mode. See SETUP.md for Firebase setup.")
else:
    st.info("ℹ️ Firebase not configured. App running in local mode without authentication.")

# Page configuration
st.set_page_config(
    page_title="ChatGPT", 
    page_icon="💬", 
    layout="centered",
    initial_sidebar_state="collapsed"
)

# Custom CSS - ChatGPT-like design
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Söhne:wght@300;400;500;600;700&family=Inter:wght@400;500;600&display=swap');
    
    /* Global Styles - Dark theme like ChatGPT */
    .main {
        background: #343541;
        color: #ececf1;
        font-family: 'Söhne', 'Inter', sans-serif;
    }
    
    /* Sidebar Styling - Dark sidebar */
    [data-testid="stSidebar"] {
        background: #202123;
        border-right: 1px solid #4d4d4f;
        padding-top: 0;
    }
    
    [data-testid="stSidebar"] [data-testid="stMarkdownContainer"] p {
        color: #ececf1;
    }
    
    /* Headers */
    h1, h2, h3 {
        color: #ececf1;
        font-weight: 600;
    }
    
    h1 {
        font-size: 1.5rem;
    }
    
    h2 {
        font-size: 1.25rem;
    }
    
    h3 {
        font-size: 1.1rem;
    }
    
    /* Input boxes - Dark theme */
    .stTextInput input, .stTextArea textarea {
        background: #40414f !important;
        border: 1px solid #565869 !important;
        border-radius: 6px !important;
        color: #ececf1 !important;
        font-size: 1rem;
        padding: 0.75rem !important;
    }
    
    .stTextInput input:focus, .stTextArea textarea:focus {
        border-color: #ececf1 !important;
        outline: none !important;
    }
    
    .stTextInput input::placeholder, .stTextArea textarea::placeholder {
        color: #8e8ea0 !important;
    }
    
    /* Buttons - ChatGPT style */
    .stButton button {
        background: transparent !important;
        color: #ececf1 !important;
        border: 1px solid #565869 !important;
        border-radius: 6px !important;
        padding: 0.5rem 1rem !important;
        font-size: 0.875rem;
        font-weight: 500;
        transition: all 0.2s;
    }
    
    .stButton button:hover {
        background: #40414f !important;
        border-color: #8e8ea0 !important;
    }
    
    /* Primary action button */
    .primary-button button {
        background: #10a37f !important;
        border-color: #10a37f !important;
        color: white !important;
    }
    
    .primary-button button:hover {
        background: #0d8968 !important;
        border-color: #0d8968 !important;
    }
    
    /* Chat messages - ChatGPT alternating background */
    .stChatMessage {
        background: transparent !important;
        border: none !important;
        padding: 1.5rem 1rem !important;
        margin: 0 !important;
    }
    
    .stChatMessage[data-testid="user-message"] {
        background: #343541 !important;
    }
    
    .stChatMessage[data-testid="assistant-message"] {
        background: #444654 !important;
    }
    
    .stChatMessage p {
        color: #ececf1 !important;
        line-height: 1.7;
    }
    
    /* Tabs - Dark theme */
    .stTabs [data-baseweb="tab-list"] {
        gap: 0;
        background: transparent;
        border-bottom: 1px solid #4d4d4f;
    }
    
    .stTabs [data-baseweb="tab"] {
        background: transparent;
        color: #8e8ea0;
        border: none;
        border-bottom: 2px solid transparent;
        font-weight: 500;
        padding: 0.75rem 1rem;
    }
    
    .stTabs [data-baseweb="tab"]:hover {
        color: #ececf1;
    }
    
    .stTabs [aria-selected="true"] {
        background: transparent !important;
        color: #ececf1 !important;
        border-bottom: 2px solid #10a37f !important;
    }
    
    /* Cards - Dark theme */
    .card {
        background: #2a2b32;
        border: 1px solid #4d4d4f;
        border-radius: 8px;
        padding: 1rem;
        margin: 0.75rem 0;
    }
    
    .card:hover {
        background: #2f3038;
        border-color: #565869;
    }
    
    .info-card {
        background: #2a2b32;
        border: 1px solid #4d4d4f;
        border-radius: 8px;
        padding: 1rem;
        margin: 1rem 0;
        color: #ececf1;
    }
    
    .stat-box {
        background: #2a2b32;
        border: 1px solid #4d4d4f;
        border-radius: 8px;
        padding: 1rem;
        text-align: center;
        margin: 0.5rem 0;
    }
    
    .stat-number {
        font-size: 1.5rem;
        color: #10a37f;
        font-weight: 600;
    }
    
    .stat-label {
        color: #8e8ea0;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 0.25rem;
    }
    
    /* Radio buttons - Dark */
    .stRadio > label {
        color: #ececf1;
        font-size: 0.875rem;
        font-weight: 500;
    }
    
    .stRadio [role="radiogroup"] {
        gap: 0.25rem;
    }
    
    /* Selectbox - Dark */
    .stSelectbox label {
        color: #ececf1 !important;
    }
    
    /* File uploader - Dark */
    [data-testid="stFileUploader"] {
        background: #2a2b32;
        border: 1px dashed #565869;
        border-radius: 8px;
        padding: 1.5rem;
    }
    
    [data-testid="stFileUploader"]:hover {
        border-color: #8e8ea0;
        background: #2f3038;
    }
    
    /* Divider */
    hr {
        border-color: #4d4d4f;
        opacity: 1;
        margin: 1rem 0;
    }
    
    /* Chat input - Bottom fixed like ChatGPT */
    .stChatInputContainer {
        border-top: 1px solid #4d4d4f !important;
        background: #343541 !important;
        padding: 1rem !important;
    }
    
    .stChatInputContainer textarea {
        background: #40414f !important;
        border: 1px solid #565869 !important;
        color: #ececf1 !important;
        border-radius: 8px !important;
    }
    
    /* Success/Warning boxes - Dark */
    .success-box {
        background: #1a3a2a;
        border: 1px solid #10a37f;
        border-radius: 6px;
        padding: 0.875rem;
        color: #6eead0;
        margin: 1rem 0;
    }
    
    .warning-box {
        background: #3a331a;
        border: 1px solid #f59e0b;
        border-radius: 6px;
        padding: 0.875rem;
        color: #fbbf24;
        margin: 1rem 0;
    }
    
    .error-box {
        background: #3a1a1a;
        border: 1px solid #ef4444;
        border-radius: 6px;
        padding: 0.875rem;
        color: #fca5a5;
        margin: 1rem 0;
    }
    
    /* Labels - Dark */
    label {
        font-weight: 500;
        color: #ececf1 !important;
        font-size: 0.875rem;
    }
    
    /* Progress bar */
    .stProgress > div > div {
        background-color: #10a37f !important;
    }
    
    /* Expander - Dark */
    .streamlit-expanderHeader {
        background: #2a2b32;
        border: 1px solid #4d4d4f;
        border-radius: 6px;
        color: #ececf1;
    }
    
    /* Sidebar conversation items */
    .conversation-item {
        background: #2a2b32;
        border: 1px solid transparent;
        border-radius: 6px;
        padding: 0.75rem;
        margin: 0.25rem 0;
        cursor: pointer;
        transition: all 0.2s;
        color: #ececf1;
    }
    
    .conversation-item:hover {
        background: #2f3038;
        border-color: #4d4d4f;
    }
    
    .conversation-item.active {
        background: #343541;
        border-color: #565869;
    }
    
    /* Hide Streamlit branding */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
</style>
""", unsafe_allow_html=True)

# Initialize session state
if 'messages' not in st.session_state:
    st.session_state['messages'] = []
if 'user_id' not in st.session_state:
    st.session_state['user_id'] = None
if 'user_email' not in st.session_state:
    st.session_state['user_email'] = None
if 'current_conversation_id' not in st.session_state:
    st.session_state['current_conversation_id'] = None
if 'show_auth' not in st.session_state:
    st.session_state['show_auth'] = True

# Initialize ChatGPT model
@st.cache_resource
def get_chatbot():
    return ChatOpenAI(
        model_name="gpt-4o",
        temperature=0.7,
        openai_api_key=os.getenv('OPENAI_API_KEY')
    )

def show_firebase_setup_instructions():
    """Show Firebase setup instructions"""
    st.markdown("## 🔥 Firebase Setup Required")
    st.markdown("---")
    
    st.markdown("""
    ### To enable user authentication and cloud storage:
    
    **1. Get Your Firebase Service Account Key:**
    - Go to [Firebase Console](https://console.firebase.google.com/)
    - Select project: **ikamba-1c669**
    - Click ⚙️ → Project Settings → Service Accounts
    - Click "Generate New Private Key"
    - Save as `firebase_config.json` in project folder
    
    **2. Enable Firebase Services:**
    - **Firestore Database**: Create Database → Production mode
    - **Authentication**: Enable Email/Password sign-in
    
    **3. Restart the app**
    
    For detailed instructions, see `SETUP.md`
    """)
    
    st.markdown("---")
    st.markdown("### Or Continue Without Authentication")
    st.markdown("You can use the app in local mode (no user accounts, conversations not saved)")
    
    if st.button("Continue in Local Mode", use_container_width=True):
        st.session_state['show_auth'] = False
        st.rerun()

def show_auth_page():
    """Show login/signup page"""
    st.markdown("## Welcome to ChatGPT")
    st.markdown("---")
    
    tab1, tab2 = st.tabs(["Login", "Sign Up"])
    
    with tab1:
        st.markdown("### Login to your account")
        with st.form("login_form"):
            email = st.text_input("Email", placeholder="your@email.com")
            password = st.text_input("Password", type="password")
            submit = st.form_submit_button("Login", use_container_width=True)
            
            if submit:
                if email and password:
                    user_id, error = FirebaseManager.verify_user(email, password)
                    if user_id:
                        st.session_state['user_id'] = user_id
                        st.session_state['user_email'] = email
                        st.session_state['show_auth'] = False
                        st.success("✓ Logged in successfully!")
                        time.sleep(0.5)
                        st.rerun()
                    else:
                        st.error(f"Login failed: {error}")
                else:
                    st.warning("Please enter both email and password")
    
    with tab2:
        st.markdown("### Create a new account")
        with st.form("signup_form"):
            new_email = st.text_input("Email", placeholder="your@email.com", key="signup_email")
            new_name = st.text_input("Display Name", placeholder="Your Name")
            new_password = st.text_input("Password", type="password", key="signup_password")
            confirm_password = st.text_input("Confirm Password", type="password")
            signup_submit = st.form_submit_button("Sign Up", use_container_width=True)
            
            if signup_submit:
                if new_email and new_password and confirm_password:
                    if new_password != confirm_password:
                        st.error("Passwords don't match!")
                    elif len(new_password) < 6:
                        st.error("Password must be at least 6 characters")
                    else:
                        user_id, error = FirebaseManager.create_user(new_email, new_password, new_name)
                        if user_id:
                            st.session_state['user_id'] = user_id
                            st.session_state['user_email'] = new_email
                            st.session_state['show_auth'] = False
                            st.success("✓ Account created successfully!")
                            time.sleep(0.5)
                            st.rerun()
                        else:
                            st.error(f"Signup failed: {error}")
                else:
                    st.warning("Please fill in all fields")

def main():
    # Check if Firebase is enabled
    if not FIREBASE_ENABLED:
        if st.session_state.get('show_auth', True):
            show_firebase_setup_instructions()
            return
        # Continue in local mode without auth
    elif st.session_state['show_auth'] or not st.session_state['user_id']:
        show_auth_page()
        return
    
    # Sidebar with user info and chat history
    with st.sidebar:
        st.markdown("## ChatGPT")
        
        # Show user info if Firebase enabled
        if FIREBASE_ENABLED and st.session_state.get('user_email'):
            st.markdown(f"👤 **{st.session_state['user_email']}**")
        else:
            st.markdown("💻 **Local Mode**")
        
        st.markdown("")
        
        if st.button("➕ New Chat", use_container_width=True):
            # Save current conversation if Firebase is enabled and user logged in
            if FIREBASE_ENABLED and st.session_state.get('user_id'):
                if st.session_state['messages'] and st.session_state.get('current_conversation_id'):
                    FirebaseManager.update_conversation(
                        st.session_state['user_id'],
                        st.session_state['current_conversation_id'],
                        st.session_state['messages']
                    )
                elif st.session_state['messages']:
                    # Create new conversation
                    conv_id, error = FirebaseManager.save_conversation(
                        st.session_state['user_id'],
                        st.session_state['messages']
                    )
                    if conv_id:
                        st.session_state['current_conversation_id'] = conv_id
            
            # Start new chat
            st.session_state['messages'] = []
            st.session_state['current_conversation_id'] = None
            st.rerun()
        
        st.markdown("---")
        
        # Load conversation history if Firebase enabled
        if FIREBASE_ENABLED and st.session_state.get('user_id'):
            conversations = FirebaseManager.get_conversations(st.session_state['user_id'])
            if conversations:
                st.markdown("### Recent Chats")
                for conv in conversations[:5]:
                    # Get first message as title
                    title = "New Chat"
                    if conv.get('messages') and len(conv['messages']) > 0:
                        first_msg = conv['messages'][0].get('content', 'New Chat')
                        title = first_msg[:30] + "..." if len(first_msg) > 30 else first_msg
                    
                    if st.button(f"💬 {title}", key=conv['id'], use_container_width=True):
                        st.session_state['messages'] = conv['messages']
                        st.session_state['current_conversation_id'] = conv['id']
                        st.rerun()
            
            st.markdown("---")
        
        st.markdown("**Model**")
        st.markdown("GPT-4")
        st.markdown("")
        st.markdown("**Messages**")
        st.markdown(f"{len(st.session_state['messages'])}")
        
        # Logout button if Firebase enabled
        if FIREBASE_ENABLED and st.session_state.get('user_id'):
            st.markdown("---")
            if st.button("🚪 Logout", use_container_width=True):
                # Save current conversation before logout
                if st.session_state['messages']:
                    if st.session_state.get('current_conversation_id'):
                        FirebaseManager.update_conversation(
                            st.session_state['user_id'],
                            st.session_state['current_conversation_id'],
                            st.session_state['messages']
                        )
                    else:
                        FirebaseManager.save_conversation(
                            st.session_state['user_id'],
                            st.session_state['messages']
                        )
                
                st.session_state['user_id'] = None
                st.session_state['user_email'] = None
                st.session_state['messages'] = []
                st.session_state['current_conversation_id'] = None
                st.session_state['show_auth'] = True
                st.rerun()

    # Display chat messages
    for message in st.session_state['messages']:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])
    
    # Chat input
    if prompt := st.chat_input("Message ChatGPT..."):
        # Add user message to chat
        st.session_state['messages'].append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)
        
        # Get AI response
        with st.chat_message("assistant"):
            message_placeholder = st.empty()
            full_response = ""
            
            # Get chatbot
            chatbot = get_chatbot()
            
            # Convert messages to LangChain format
            langchain_messages = []
            for msg in st.session_state['messages']:
                if msg["role"] == "user":
                    langchain_messages.append(HumanMessage(content=msg["content"]))
                elif msg["role"] == "assistant":
                    langchain_messages.append(AIMessage(content=msg["content"]))
            
            # Get response
            try:
                with st.spinner("Thinking..."):
                    response = chatbot.invoke(langchain_messages)
                    full_response = response.content
                message_placeholder.markdown(full_response)
            except Exception as e:
                full_response = f"Error: {str(e)}"
                message_placeholder.markdown(full_response)
        
        # Add assistant response to chat history
        st.session_state['messages'].append({"role": "assistant", "content": full_response})
        
        # Auto-save conversation to Firestore if Firebase enabled
        if FIREBASE_ENABLED and st.session_state.get('user_id'):
            if st.session_state.get('current_conversation_id'):
                FirebaseManager.update_conversation(
                    st.session_state['user_id'],
                    st.session_state['current_conversation_id'],
                    st.session_state['messages']
                )
            else:
                # Create new conversation if first message
                if len(st.session_state['messages']) >= 2:
                    conv_id, error = FirebaseManager.save_conversation(
                        st.session_state['user_id'],
                        st.session_state['messages']
                    )
                    if conv_id:
                        st.session_state['current_conversation_id'] = conv_id

if __name__ == "__main__":
    main()
