# emqtt-bench — zvanični MQTT benchmark alat (EMQX).
#
# Koristimo ZVANIČNI PREBUILT image (build iz izvora povlači quicer/msquic + openssl,
# što traži cmake i dug C/C++ build — nepraktično). Ovaj Dockerfile samo re-taguje prebuilt:
#
#   docker build -t emqtt-bench benchmarks/mqtt      # -> lokalni tag `emqtt-bench`
# ili direktno:
#   docker pull emqx/emqtt-bench:latest
#
# Pokretanje:
#   docker run --rm --network project-02_default emqtt-bench \
#     pub -h mosquitto -t iot/measurements -c 100 -q 1 -I 10 -s 200

FROM emqx/emqtt-bench:latest
