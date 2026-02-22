import psycopg2

def get_connection():
    connection = psycopg2.connect(
        host="localhost",
        database="AI-PATIENT-FLOW",
        user="postgres",
        password="subhankar"
    )
    return connection