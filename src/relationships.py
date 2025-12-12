import json
import os
from datetime import datetime

class RelationshipGraph:
    def __init__(self, storage_path="./relationships"):
        self.storage_path = storage_path
        os.makedirs(storage_path, exist_ok=True)
        self.graph_file = os.path.join(storage_path, "relationship_graph.json")
        self.graph = self._load_graph()
    
    def _load_graph(self):
        """Load the relationship graph from disk."""
        if os.path.exists(self.graph_file):
            with open(self.graph_file, 'r') as f:
                return json.load(f)
        return {"personas": {}, "relationships": []}
    
    def _save_graph(self):
        """Save the relationship graph to disk."""
        with open(self.graph_file, 'w') as f:
            json.dump(self.graph, f, indent=2)
    
    def add_persona(self, persona_name, metadata=None):
        """Add a persona to the graph."""
        if persona_name not in self.graph["personas"]:
            self.graph["personas"][persona_name] = {
                "created_at": datetime.now().isoformat(),
                "metadata": metadata or {},
                "total_conversations": 0
            }
            self._save_graph()
    
    def record_interaction(self, persona_a, persona_b, conversation_summary=""):
        """Record an interaction between two personas."""
        # Ensure both personas exist
        self.add_persona(persona_a)
        self.add_persona(persona_b)
        
        # Find or create relationship
        relationship = None
        for rel in self.graph["relationships"]:
            if set([rel["persona_a"], rel["persona_b"]]) == set([persona_a, persona_b]):
                relationship = rel
                break
        
        if not relationship:
            relationship = {
                "persona_a": persona_a,
                "persona_b": persona_b,
                "interaction_count": 0,
                "last_interaction": None,
                "relationship_type": "acquaintance"
            }
            self.graph["relationships"].append(relationship)
        
        # Update relationship
        relationship["interaction_count"] += 1
        relationship["last_interaction"] = datetime.now().isoformat()
        
        # Determine relationship type based on interaction count
        if relationship["interaction_count"] > 50:
            relationship["relationship_type"] = "best_friend"
        elif relationship["interaction_count"] > 20:
            relationship["relationship_type"] = "close_friend"
        elif relationship["interaction_count"] > 5:
            relationship["relationship_type"] = "friend"
        
        self._save_graph()
    
    def get_friends(self, persona_name):
        """Get all friends of a persona."""
        friends = []
        for rel in self.graph["relationships"]:
            if rel["persona_a"] == persona_name:
                friends.append({
                    "name": rel["persona_b"],
                    "type": rel["relationship_type"],
                    "interactions": rel["interaction_count"]
                })
            elif rel["persona_b"] == persona_name:
                friends.append({
                    "name": rel["persona_a"],
                    "type": rel["relationship_type"],
                    "interactions": rel["interaction_count"]
                })
        return friends
    
    def get_friend_group(self, persona_name):
        """Get the friend group of a persona using network analysis."""
        visited = set()
        friend_group = set()
        
        def dfs(current_persona):
            if current_persona in visited:
                return
            visited.add(current_persona)
            friend_group.add(current_persona)
            
            friends = self.get_friends(current_persona)
            for friend in friends:
                if friend["type"] in ["friend", "close_friend", "best_friend"]:
                    dfs(friend["name"])
        
        dfs(persona_name)
        return list(friend_group)
    
    def get_relationship_type(self, persona_a, persona_b):
        """Get the relationship type between two personas."""
        for rel in self.graph["relationships"]:
            if set([rel["persona_a"], rel["persona_b"]]) == set([persona_a, persona_b]):
                return rel["relationship_type"]
        return "stranger"
    
    def get_all_personas(self):
        """Get all personas in the system."""
        return list(self.graph["personas"].keys())
