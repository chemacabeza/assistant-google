import psycopg2
from datetime import datetime, timedelta
import random

# Database connection
conn = psycopg2.connect(
    dbname="assistant_db",
    user="assistant_user",
    password="assistant_password",
    host="localhost",
    port="5433"
)
cur = conn.cursor()

contacts = [
    ("33123456789", "Moi"), # Special case
    ("346111222", "Carlos Alarcon"),
    ("346222333", "Mamá"),
    ("346333444", "Jennifer Lee Hillestad"),
    ("4477889900", "Boss"),
    ("4499887766", "Team Lead"),
    ("12025550101", "Emma Watson"),
    ("12025550102", "Project X Group"),
    ("49152111222", "Hans Schmidt"),
    ("49152333444", "Berlin Meetup"),
    ("33711223344", "Sophie Martin"),
    ("33722334455", "Le Café Group"),
    ("81901122334", "Tanaka San"),
    ("81905566778", "Kyoto Travel"),
    ("61411223344", "John Citizen"),
    ("61499887766", "Sydney Office"),
    ("55119988776", "Ricardo Silva"),
    ("55118877665", "Family Brazil"),
    ("91987654321", "Priya Sharma"),
    ("91887766554", "Tech Support"),
]

# Random message types
templates = [
    "Hey, how is it going?",
    "Did you see the latest update?",
    "Can we jump on a quick call?",
    "The recordings are ready for review.",
    "Casi 1 hora comiendo!",
    "Looking forward to our sync!",
    "Check out this link: https://google.com",
    "Where are the hats?",
    "I am running out of time.",
    "Do you still need your hats?",
    "Perfect, thanks!",
    "Let me know when you arrive.",
    "The meeting has been rescheduled.",
    "Did you get the email?",
    "Great work on the dashboard!",
]

start_time = datetime.now() - timedelta(days=7)

for phone, name in contacts:
    for i in range(30):
        timestamp = start_time + timedelta(hours=random.randint(0, 168), minutes=random.randint(0, 59))
        direction = "INCOMING" if random.random() > 0.3 else "OUTGOING"
        content = random.choice(templates)
        message_sid = f"seed_{phone}_{i}"
        
        cur.execute(
            "INSERT INTO whatsapp_messages (sender_id, sender_name, content, direction, message_sid, timestamp) VALUES (%s, %s, %s, %s, %s, %s)",
            (phone, name, content, direction, message_sid, timestamp)
        )

conn.commit()
cur.close()
conn.close()
print("Seeded 600 messages across 20 conversations successfully.")
