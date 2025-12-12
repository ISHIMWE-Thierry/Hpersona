import os
from dotenv import load_dotenv
from src.brain import DigitalBrain

# Load environment variables (API keys)
load_dotenv()

def main():
    print("Initializing Digital Persona...")
    
    # You can change the name to whoever you want to mimic
    persona_name = input("Enter the name of the person to mimic: ")
    brain = DigitalBrain(persona_name=persona_name)

    while True:
        print("\nOptions:")
        print("1. Talk to the brain")
        print("2. Teach the brain (Load data from /data folder)")
        print("3. Exit")
        
        choice = input("Choose an option: ")

        if choice == "1":
            print(f"\n(Talking to {persona_name}...)")
            while True:
                user_input = input("You: ")
                if user_input.lower() in ['exit', 'quit', 'back']:
                    break
                
                response = brain.think(user_input)
                print(f"{persona_name}: {response}")

        elif choice == "2":
            data_path = os.path.join(os.getcwd(), "data")
            brain.learn(data_path)
            
        elif choice == "3":
            print("Goodbye.")
            break
        else:
            print("Invalid choice.")

if __name__ == "__main__":
    main()
