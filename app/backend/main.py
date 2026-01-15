import uvicorn

if __name__ == "__main__":
    # Disable reload for production/deployment
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
