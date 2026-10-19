read -p "Press Enter  to continue..."
source /home/ubongudofia/Desktop/dsa_messenger_prod/venv/bin/activate
cd /home/ubongudofia/Desktop/dsa_messenger_prod/
gunicorn -k eventlet -w 1 -b 0.0.0.0:5005 app:app
