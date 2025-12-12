import firebase_admin
from firebase_admin import credentials, firestore, auth
import streamlit as st
import os
from datetime import datetime
import json

class FirebaseManager:
    _initialized = False
    
    @classmethod
    def initialize(cls):
        """Initialize Firebase Admin SDK"""
        if not cls._initialized:
            try:
                # Try to get existing app
                firebase_admin.get_app()
            except ValueError:
                # Initialize new app if doesn't exist
                cred = None
                
                # Try Streamlit secrets first (for Streamlit Cloud)
                if hasattr(st, 'secrets') and 'firebase' in st.secrets:
                    # Convert Streamlit secrets to dict
                    firebase_config = dict(st.secrets['firebase'])
                    cred = credentials.Certificate(firebase_config)
                # Fall back to local file
                elif os.path.exists('firebase_config.json'):
                    cred = credentials.Certificate('firebase_config.json')
                else:
                    raise ValueError("No Firebase configuration found")
                
                firebase_admin.initialize_app(cred)
            cls._initialized = True
    
    @classmethod
    def get_db(cls):
        """Get Firestore database instance"""
        cls.initialize()
        return firestore.client()
    
    @classmethod
    def create_user(cls, email, password, display_name=None):
        """Create a new user with email and password"""
        cls.initialize()
        try:
            user = auth.create_user(
                email=email,
                password=password,
                display_name=display_name
            )
            
            # Create user document in Firestore
            db = cls.get_db()
            db.collection('users').document(user.uid).set({
                'email': email,
                'display_name': display_name or email.split('@')[0],
                'created_at': datetime.now(),
                'conversations': []
            })
            
            return user.uid, None
        except Exception as e:
            return None, str(e)
    
    @classmethod
    def verify_user(cls, email, password):
        """Verify user credentials (simplified - in production use Firebase Auth REST API)"""
        cls.initialize()
        try:
            # Get user by email
            user = auth.get_user_by_email(email)
            return user.uid, None
        except Exception as e:
            return None, str(e)
    
    @classmethod
    def get_user_data(cls, user_id):
        """Get user data from Firestore"""
        cls.initialize()
        db = cls.get_db()
        try:
            doc = db.collection('users').document(user_id).get()
            if doc.exists:
                return doc.to_dict()
            return None
        except Exception as e:
            st.error(f"Error fetching user data: {e}")
            return None
    
    @classmethod
    def save_conversation(cls, user_id, conversation_data):
        """Save a conversation to Firestore"""
        cls.initialize()
        db = cls.get_db()
        try:
            # Create conversation document
            conversation_ref = db.collection('users').document(user_id).collection('conversations').document()
            conversation_ref.set({
                'messages': conversation_data,
                'created_at': datetime.now(),
                'updated_at': datetime.now()
            })
            return conversation_ref.id, None
        except Exception as e:
            return None, str(e)
    
    @classmethod
    def get_conversations(cls, user_id, limit=10):
        """Get user's conversations from Firestore"""
        cls.initialize()
        db = cls.get_db()
        try:
            conversations = db.collection('users').document(user_id)\
                .collection('conversations')\
                .order_by('updated_at', direction=firestore.Query.DESCENDING)\
                .limit(limit)\
                .stream()
            
            result = []
            for conv in conversations:
                data = conv.to_dict()
                data['id'] = conv.id
                result.append(data)
            return result
        except Exception as e:
            st.error(f"Error fetching conversations: {e}")
            return []
    
    @classmethod
    def update_conversation(cls, user_id, conversation_id, messages):
        """Update an existing conversation"""
        cls.initialize()
        db = cls.get_db()
        try:
            db.collection('users').document(user_id)\
                .collection('conversations').document(conversation_id)\
                .update({
                    'messages': messages,
                    'updated_at': datetime.now()
                })
            return True, None
        except Exception as e:
            return False, str(e)
    
    @classmethod
    def delete_conversation(cls, user_id, conversation_id):
        """Delete a conversation"""
        cls.initialize()
        db = cls.get_db()
        try:
            db.collection('users').document(user_id)\
                .collection('conversations').document(conversation_id).delete()
            return True, None
        except Exception as e:
            return False, str(e)
