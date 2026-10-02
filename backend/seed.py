import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment variables
load_dotenv()

# Add the current directory to sys.path to enable importing app module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database.connection import init_db, engine
from app.database.operations import get_user_by_username, create_user
from app.auth import hash_password

def seed_database():
    print("Initializing database connection and tables...")
    init_db()
    
    if not engine:
        print("Error: Database engine could not be initialized. Please check your DATABASE_URL in .env.")
        sys.exit(1)
        
    # Define users to seed
    users_to_seed = [
        {
            "username": "admin",
            "email": "admin@loandna.com",
            "password": "123456789",
            "role": "admin"
        },
        {
            "username": "user",
            "email": "user@loandna.com",
            "password": "123456789",
            "role": "user"
        }
    ]
    
    print("\nStarting seeding process...")
    
    for user_data in users_to_seed:
        username = user_data["username"]
        email = user_data["email"]
        password = user_data["password"]
        role = user_data["role"]
        
        # Check if user already exists
        existing_user = get_user_by_username(username)
        if existing_user:
            print(f"[-] User '{username}' already exists. Skipping.")
        else:
            try:
                pwd_hash = hash_password(password)
                created = create_user(username=username, email=email, password_hash=pwd_hash, role=role)
                print(f"[+] Successfully seeded user with role '{role}':")
                print(f"    - Username: {username}")
                print(f"    - Email:    {email}")
                print(f"    - Password: {password}")
            except Exception as e:
                print(f"[x] Error seeding user '{username}': {e}")
                
    print("\nSeeding finished! You can now log in using these credentials.")

if __name__ == "__main__":
    seed_database()
