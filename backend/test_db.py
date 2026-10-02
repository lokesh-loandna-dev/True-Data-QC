import pyodbc

server = "ldprodazsqldb-truedata.database.windows.net"
database = "ldprodazsqldbsrv02"
username = "ldprodadmintruesql"
password = "azURE!$qLdBPwD#009"

connection_string = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    f"SERVER={server};"
    f"DATABASE={database};"
    f"UID={username};"
    f"PWD={password};"
    "Encrypt=yes;"
    "TrustServerCertificate=no;"
    "Connection Timeout=30;"
)

try:
    print("Testing Azure SQL connection...")

    conn = pyodbc.connect(connection_string)

    print("SUCCESS: Connected to Azure SQL")

    cursor = conn.cursor()

    cursor.execute("SELECT DB_NAME()")
    print("Database:", cursor.fetchone()[0])

    cursor.execute("SELECT SUSER_SNAME()")
    print("Login:", cursor.fetchone()[0])

    cursor.execute("SELECT @@VERSION")
    print("SQL Server:")
    print(cursor.fetchone()[0])

    cursor.close()
    conn.close()

    print("Database connectivity test completed successfully.")

except Exception as e:
    print("FAILED:")
    print(e)
