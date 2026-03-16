"""
Cruza a lista fornecida pela Dra. Mozania com os dados do banco staging.
Gera CSV com: N, prontuario_lista, nome_lista, prontuario_banco, nome_banco (raw), nome_banco (normalized), match_score, notas
"""

import json
import csv
import unicodedata
import re
from difflib import SequenceMatcher

# --- Lista da Dra. Mozania ---
MOZANIA_LIST = [
    (1, "006.31.016", "Neusa Maria O. Luccas"),
    (2, "006.31.088", "Durval Cavalcante Pereira"),
    (3, "006.31.025", "Jose Barbaresco"),
    (4, "006.31.011", "Mauricio José Leitão"),
    (5, "006.31.156", "Lindalva da Silva"),
    (6, "006.31.088", "Geni dos Santos Gonçalves"),
    (7, "006.31.017", "Edna Aparecida Zambianco"),
    (8, "006.31.073", "Wilson de Jesus"),
    (9, "006.31.014", "Roseni Aparecida Ribeiro"),
    (10, "006.31.025", "Elvira C. Barbaresco"),
    (11, "006.31.014", "Sidnei Ribeiro"),
    (12, "006.31.076", "Jaime Alves de Almeida"),
    (13, "006.31.162", "Maria Tereza A. Trujello"),
    (15, "006.31.010", "Maria das Graças"),
    (16, "006.31.080", "Aparecida Pereira Batista"),
    (17, "006.32.018", "Noroilda P. Pereira"),
    (19, "006.31.042", "Amaro Jose Silva"),
    (20, "006.31.55", "Valdirene S. Santos"),
    (21, "006.32.131", "Carlos Alberto Vazão"),
    (22, "006.31.091", "Dalva Aparecida Mendonça"),
    (23, "006.32.125", "Osmar Batista Santos"),
    (24, "006.32.148", "Norelina G. de Oliveira"),
    (25, "006.33.017", "Maria do Socorro Castro"),
    (26, "006.31.122", "Elci Aparecida Berne"),
    (27, "006.31.014", "Adriana Aparecida Vital Soler"),
    (28, "006.33.52", "Joel Aguiar de Jesus"),
    (29, "006.32.058", "Maria Eliete Santos Caro"),
    (30, "006.32.117", "Deraldo dos Anjos"),
    (568, "005.25.146", "FERNANDO RODRIGUES DE S."),
    (32, "006.31.163", "Florisvaldo S. Cruz Junior"),
    (33, "006.31.163", "Maria Madalena"),
    (34, "006.32.048", "Maria Aparecida Monteiro"),
    (35, "006.33.040", "Maria do Socorro Silva"),
    (36, "006.33.040", "Ivo Bueno Nogueira"),
    (38, "006.33.081", "Antonio Rodrigues"),
    (39, "006.32.003", "Celia Alves de Araujo"),
    (40, "006.31.084", "Maria Aparecida Espínheira"),
    (41, "006.31.058", "Maria Lucia de Goes"),
    (42, "006.34.012", "Rosa Yukiko Takara"),
    (43, "006.33.08", "Maria Rosario de Melo"),
    (44, "006.33.134", "Marina Amalia Levy da Silva"),
    (45, "006.34.038", "Valderez Cruz Ribeiro"),
    (46, "006.32.021", "MARLI APARECIDA OLIVEIRA"),
    (141, "001.01.105", "Takeshi Sadakane"),
    (48, "006.32.040", "Marlene Bispo Damasceno"),
    (49, "006.35.082", "Candido Jose Santos"),
    (50, "006.33.140", "Fernando Magalhães"),
    (51, "006.33.005", "Mario Benevides"),
    (52, "006.34.028", "Maria Cecilia Vallio"),
    (53, "006.32.006", "Paulo Rogerio Ferreira"),
    (55, "006.33.125", "Sergio Gatti"),
    (56, "006.33.111", "Marcilia Alves Correia de Freitas"),
    (57, "006.33.20", "Yaheko Oshiro"),
    (58, "006.33.020", "Paulo Kioshi Oshiro"),
    (59, "006.35.086", "Andreia Mariano"),
    (60, "006.35.086", "Sara Angelica Rezende"),
    (61, "006.33.995", "Arnaldo da Silva"),
    (62, "006.34.142", "Antonia Ferreira Ribeiro"),
    (63, "006.33.04", "Roberto Martins de Oliveira"),
    (64, "006.31.150", "Selma Maria de Souza"),
    (65, "006.31.105", "Luiz Moreira Neto"),
    (66, "006.34.141", "Edna de Barros Sanches"),
    (67, "006.34.087", "Maria Helena G. Geronimo"),
    (68, "006.31.82", "Neide Cavalcante do Nascimento"),
    (69, "006.31.82", "Genilda de Cássia C. Silva"),
    (70, "006.34.153", "Vitor Donizete Silva"),
    (71, "006.34.157", "Mara Antonio de Mello"),
    (72, "000. ESF", "Ercilia de Souza"),
    (73, "006.34.128", "Adriana Aparecida C. Ribeiro"),
    (74, "006.33.37", "Terezinha Shirley"),
    (75, "006.34.104", "Susy Carla F.G. Santos"),
    (76, "006.35.087", "Eny Vargas"),
    (77, "006.35.091", "Janete Gomes Alves"),
    (78, "006.35.050", "Carmerindo Sampaio"),
    (79, "006.35.024", "Maria Rosa E. Grande"),
    (80, "006.32.011", "Rosivaldo de Jesus Silva"),
    (81, "006.36.026", "Nelice Alves de Souza"),
    (82, "006.36.036", "Tania de Souza Orteja da Silva"),
    (83, "006.36.069", "Neide Maria Almeida"),
    (84, "006.36.096", "Izabel C. Mendes S. Freitas"),
    (85, "006.36.024", "Lourdes Rogerio Guerra"),
    (86, "006.35.137", "Everaldo Vicente"),
    (87, "006.35.165", "Gutemberg da S. Feitosa"),
    (89, "006.36..120", "Elisabeth Carlos Farote"),
    (90, "006.36.130", "Lucia de Moraes Borrego"),
    (91, "006.36.130", "Sebastião Antonio Bezerra"),
    (92, "007.38.061", "Marivaldo dos Santos Costa"),
    (93, "006.36.049", "Maria Madalena S. Rocha"),
    (94, "006.36.039", "Giseli Cristina G. Santos"),
    (95, "006.36.034", "Robson de Jesus Rodrigues"),
    (96, "001.02.181", "Alipio Altino Pereira"),
    (97, "006.33.170", "Lino Ezequiel da Costa"),
    (98, "001.02.084", "Dorival de Jesus Lopes"),
    (99, "001.02.152", "Alexandre Melim Rissi"),
    (100, "001.01.004", "Avi Aharonovitz"),
    (101, "006.35.122", "Nivaldo Medina"),
    (103, "006.35.045", "Ivani Egydio"),
    (104, "006.36.145", "Jose Fernando de Lima"),
    (105, "001.02.123", "Marcia Luz Marina Silva"),
    (106, "006.35.045", "Wilson Ananias da Silva"),
    (107, "001.02.086", "Leandro L. Silva"),
    (108, "006.32.101", "Maria de Fátima Felipe"),
    (109, "001.02.143", "Jorge Ferreira da Silva"),
    (110, "006.31.161", "Ronaldo Januario da Costa"),
    (111, "Mãe da Fabi", "Celina Maria de Freitas Oliveira"),
    (113, "001.01.174", "Roseli Barbosa de Oliveira"),
    (114, "001.02.180", "Washington Luis Souza"),
    (115, "001.03.129", "Maria do Socorro B. Silva"),
    (117, "006.35.072", "Lazara Hortelan Correa"),
    (119, "001.01.095", "Celso Luiz Pitta"),
    (120, "001.05.148", "Rude Marques M. de Souza"),
    (121, "001.01.159", "Jose Andrade dos S. Neto"),
    (123, "001.01.131", "Orlando Cesar M. Santos"),
    (124, "006.33.175", "Milton Ferreira dos Santos"),
    (882, "005.26.047", "ANIBAL JOSÉ DA SILVA"),
    (126, "001.03.118", "Regina Santana Queiroz"),
    (127, "001.01.123", "Antonio Gonçalves de Souza"),
    (128, "006.33.048", "Maria da Graça Santos"),
    (129, "001.01.032", "Maurilice Bezerra de Souza"),
    (130, "Mãe de stephane", "Leonilda Cardoso da Cunha"),
    (131, "001.03.170", "Iraci Aparecida Neves Silva"),
    (132, "001.01.168", "Zita Gorete D. Vizinho"),
    (133, "001.05.126", "Olavo Alves Siqueira"),
    (134, "001.01.116", "Fatima Salete S.G. Baptista"),
    (135, "001.01.047", "Antonio Alves Santana"),
    (136, "001.05.130", "Arlete Alves Siqueira"),
    (137, "001.05.124", "Luiz Antonio R. Junior"),
    (138, "001.05.124", "Luiz Antonio Riqueza"),
    (139, "001.01.114", "Carlos Roberto Fuzetti"),
    (140, "2001.03.12", "Floraci Santos Messias"),
    (329, "5", "MARIA FLORENTINO SILVEIRA"),
    (143, "001.05.124", "Vera Lucia Sass Riqueza"),
    (144, "001.01.056", "Aparecida Auxiliadora B. de Andrade"),
    (145, "01.03.0221", "Osvaldo Teixeira Melo"),
    (146, "2001.03.24", "Perciliano M. Silva"),
    (147, "001.01.051", "Dalva Aparecida da Silva Oliveira"),
    (148, "006.36.156", "Antonio Carlos Paes"),
    (149, "001.02.147", "Maria Aparecida de Souza Gueogjian"),
    (150, "006.34.004", "Marta Helena da Silva"),
    (151, "001.02.147", "Abel Gueogjian"),
    (152, "001.03.125", "Maria da Gloria Menezes"),
    (153, "001.03.055", "João Batista Cabral"),
    (154, "001.05.131", "Maria Celia Araujo"),
    (155, "001.03.055", "Rosa Maria Cabral"),
    (156, "001.01.056", "Neusa De Fatima B. Andrade"),
    (157, "001.01.123", "Maria de Lourdes da Silva"),
    (158, "001.01.054", "Sandra Regina de Souza"),
    (159, "001.05.066", "Neide Valderes Airão"),
    (160, "001.05.066", "Luisa Rosler"),
    (161, "001.04.114", "Darcio Turbiane"),
    (162, "001.05.012", "Ariovaldo Martins"),
    (163, "001.05.046", "Sonia Marina Pereira de Faria"),
    (164, "001.05.046", "Laurindo de Farias"),
    (165, "001.05.047", "Altina Alves de Farias"),
    (166, "001.05.048", "Rosalina Alves de Faria Silva"),
    (167, "001.05.034", "José Pereira da Silva"),
    (168, "001.04.126", "Sandra Pollini"),
    (169, "001.04.114", "Fabiana da Silva Turbiane Pinto"),
    (170, "001.06.019", "Rubens Arnaldo Neto"),
    (171, "001.04.108", "Sonia Coutinho Santos"),
    (172, "001.04.086", "Miriam Gargia"),
    (173, "006.35.68", "Valéria Cristina Gonçalves"),
    (175, "001.06.031", "Jacomo Ronconglione"),
    (176, "001.04.016", "Kenji Marabaijashi"),
    (177, "001.04.108", "Eunice Coutinho Santos"),
    (125, "001.01.042", "Juraci Miranda da Silva"),
    (179, "001.04.120", "Dionisio Pino Sobrinho"),
    (180, "001.04.069", "Elaine Santos Barbosa"),
    (181, "001.04.036", "Giseli Conceição G. Nazareth"),
    (182, "001.04.004", "Zelia de Fatima B. Pantojo"),
    (183, "001.06.016", "Sandra Helena Damasceno"),
    (509, "005.27.169", "LUIZA VIEIRA DE GOUVEIA"),
    (185, "006.36.000", "Claudete Ferreira Lucas"),
    (186, "001.04.064", "Albertina C. da Costa Nascimento"),
    (187, "001.06.042", "Devanir da S. Viana"),
    (188, "001.06.056", "Guiomar dos Santos"),
    (189, "001.06.067", "Mariano da Rosa"),
    (190, "001.06.071", "Jorge Luiz Ferreira"),
    (191, "001.06.005", "Sonia Maria M. Torres"),
    (192, "001.06.050", "Aparecida da S. Almeida"),
    (193, "001.04.081", "Sergio Gonçalves Fontes"),
    (194, "001.04.081", "Sandra M. Costa F. Fontes"),
    (195, "001.04.106", "Albertino Coutinho Santos"),
    (196, "001.06.191", "Jose Euzebio J. Teixeira"),
    (197, "001.05.106", "Edson Soares Pinto"),
    (198, "001.06.178", "Edilson Tenorio Anjos"),
    (199, "006.35.105", "JOSELIA GOMES DE OLIVEIRA"),
    (200, "001.06.178", "Leni Silveira dos Anjos"),
    (202, "001.04.123", "SHIRLEY MANARELLI ORLANDO"),
    (203, "001.06.156", "Marinete Luiz Bandeira"),
    (204, "001.06.187", "Divino Benedito Cunha"),
    (205, "006.35.093", "Jose Carlos Santos"),
    (206, "001.04.099", "Leandro Plácido de Oliveira"),
    (207, "001.06.118", "Ricardo Luiz Bissoli"),
    (208, "001.06.157", "Luiz Carlos F. Barreto"),
    (210, "001.06.002", "IZABEL CRISTINA RIZZO SANCHES"),
    (211, "001.04.036", "MANOEL COQUEIRO DA COSTA"),
    (212, "001.06.154", "Valda Jose Gokaya"),
    (213, "001.01.027", "PEDRO CUPERTINO"),
    (214, "001.", "MARIA APARECIDA NUNES CUPERTINO"),
    (215, "006.32.", "José João Pereira"),
    (216, "006.32.150", "Nelita Borges"),
    (217, "001.05.003", "Edondina Gomes Araujo"),
    (219, "001.", "MARIA CRISTINA COSTA FIORI"),
    (220, "006.36.30", "AVENI ARAUJO AMARATE"),
    (221, "001.01.136", "RAYMUNDO ISRAEL DE OLIVEIRA"),
    (222, "MÃE DA NILDA", "Maria da Consolação de Almeida Silva"),
    (223, "006.35.088", "Maria de Fatima Chaves"),
    (224, "01.003.13", "Jorge Yoshikatsu Takase"),
    (226, "001.01.090", "REGINA APARECIDA S. MENDES"),
    (227, "001.01.139", "Rosilis Aparecida Braga"),
    (228, "001.06.183", "FRANCISCO CANNO NETO"),
    (229, "006.33.150", "Paulo Sergio da Silva Arantes"),
    (230, "005.28.26", "SERGIO BORTOLETO"),
    (232, "", "TOSHIO SHIMANBUKO"),
    (233, "001.04.121", "IGNEZ DE CASTRO"),
    (234, "005.28.91", "MARIO SERGIO DOS SANTOS"),
    (235, "006.35", "TEREZINHA P. GUABIRABA"),
    (236, "", "RUTE DO AMARAL SANTOS"),
    (237, "005.28.17", "EURIDES DIAS ABADE"),
    (238, "001.06.007", "EUNICE AMORIM FIGUEIREDO"),
    (239, "005.28.04", "ROBERTO DA SILVA REIS"),
    (821, "007.42.100", "IRENE DA SILVA"),
    (241, "005.28.30", "MERICE VIVEIROS DOS SANTOS"),
    (242, "005.25.", "EUNICE DA COSTA SCHUBA"),
    (243, "005.28.10", "MARIA IZILDA PEREIRA DE GODOI"),
    (244, "005.28.81", "NEIDE APARECIDA ANDRADE PENTEADO"),
    (246, "005.25.53", "NILZA CABRAL DA ROSA VIEIRA"),
    (247, "005.28.001", "ALEXANDRE AKIRA TAHIRA"),
    (248, "006.32", "JESUS PIRES DA SILVA SALES"),
    (249, "005.28.65", "MARIA APARECIDA CARVALHO"),
    (250, "005.28.72", "LINDONEIDE DIAS DA SILVA"),
    (251, "001.04.166", "EUNICE CORNELIO DE MELO SILVA"),
    (252, "005.28.104", "LUIZA MARIA ROMANA BATISTA"),
    (253, "005.28.151", "KLEIDE AMELIA DE SOUZA"),
    (254, "005.28.72", "ELISETE APARECIDA SILVA LEAO"),
    (255, "001.04.120", "GILCE MARIA SOUZA PINO"),
    (256, "005.28.82", "JOACIR DA SILVA"),
    (258, "005.25.155", "NATALICE DOS SANTOS FELIX"),
    (259, "005.25.12", "JOÃO NORIMASSA KONNO"),
    (260, "005.25.102", "MARIA ODETE CARVALHO"),
    (261, "006.", "JOSÉ ALBERTO AGOSTINHO"),
    (262, "006.34.171", "JOSÉ CICERO SANTOS COSTA"),
    (263, "005.25.085", "LUZINETE JOSEFA GONÇALVES"),
    (264, "006.34.98", "MARIA DAMIANA DE SOUZA"),
    (265, "001.01.167", "OSVALDO DUARTE VIZINHO"),
    (322, "005.27.175", "IRACI TORRES MIOS"),
    (267, "005.28.55", "JORGE LUIZ DOS SANTOS"),
    (268, "005.25.26", "JURACI LIMA DE MOURA"),
    (269, "006.35.047", "SHEILA CRISTINA"),
    (270, "001.01.096", "SONIA MARIA DE CARVALHO"),
    (271, "005.25.26", "IBERE GIMENEZ"),
    (272, "", "JOSELIA MARIA DA SILVA"),
    (273, "005.25.171", "MARCIA ROSA ALVES"),
    (274, "005.25.153", "VALDERI GOMES"),
    (275, "005.25.11", "ELISANGELA COELHO DO CARMO"),
    (276, "005.25.11", "ANGELA COELHO TRINDADE"),
    (277, "005.25.125", "JOÃO SILVA DE FREITAS"),
    (278, "005.25.142", "JOSE BARBOSA DE MOURA"),
    (279, "005.25.62", "MARIA DE LOURDES VIEIRA"),
    (280, "005.25.166", "ARMANDO ABUZZERI"),
    (281, "3.197", "GISELDA CARDOSO"),
    (282, "3.170", "CARLOS ANTONIO SILVA"),
    (283, "005.27.085", "MARILDA NOGUEIRA MONACO"),
    (284, "005.27.063", "ORLANDO ALBERTO"),
    (285, "005.27.075", "JOÃO PEDROSO OLIVEIRA NETO"),
    (286, "005.27.075", "FERNANDO RODRIGO P. OLIVEIRA"),
    (287, "001.06.93", "MARCIA CASTRO OLIVEIRA"),
    (288, "005.25.01", "FABIO MAKOTO HOMAYA"),
    (289, "005.27.027", "VALÉRIA COSTA E SILVA"),
    (290, "005.27.057", "MARIO MARIFIDE YAMASHINO"),
    (291, "005.27.096", "HELAINE LEITE"),
    (292, "005.27.041", "HIROKO FUKUI SAKURAI"),
    (293, "006.31.033", "ALEXANDRE DE FREITAS NOGUEIRA"),
    (294, "005.27.026", "DEISE TEREZINHA Z.PELEGRINE"),
    (295, "005.27.42", "BERENICE SANTOS SHIMAOKA"),
    (296, "005.27.026", "ROY AUGUSTO PELEGRINE"),
    (297, "005.25.203", "IVETE APARECIDA RODRIGUES"),
    (298, "005.27.099", "MARIA DA GUIA VALE"),
    (299, "005.27.068", "SERGIO ANTONIO DA SILVA"),
    (300, "005.27.103", "JADIR VENTURA DIAS"),
    (301, "005.27.016", "RITA DE CASSIA B. NASCIMENTO"),
    (302, "005.27.016", "PEDRO VALDIR NASCIMENTO"),
    (303, "005.25.172", "ORCILIA RODRIGUES DOS SANTOS"),
    (304, "005.25.62", "WILSON DA SILVA"),
    (305, "005.25.194", "VALDERI TOMAZ DOS SANTOS DE CARVALHO"),
    (306, "001.05.070", "JOSELINA DE M. TOMINAGA"),
    (307, "001.05.070", "LUIZ NORIO TOMINAGA"),
    (308, "005.27.033", "NAIR ALMIRO DE OLIVEIRA"),
    (309, "001.05.070", "JOYCELIA A. TOMINAGA"),
    (310, "005.", "FLORACI ALMEIDA MIRANDA"),
    (311, "005.25.41", "MARINEZ COSTA"),
    (312, "005.27.189", "SILVIA LOURDES SILVA BELO"),
    (313, "005.27.132", "MARIA LIDIA DA SILVA BARBOSA"),
    (314, "5.28", "OSMAR CARREIRA"),
    (315, "5.28", "MARIA DERNIR BRUMA CARREIRA"),
    (316, "005.27.140", "YAEKO INOKUSHI"),
    (317, "005.27.187", "LAURA PEREIRA"),
    (318, "5.28", "VANDERLEI FRANCISCO LOBATO"),
    (319, "5.28", "NORBERTO CORIOLANO"),
    (320, "005.27.136", "VALQUIRIA ISIDORO BARBIENE"),
    (321, "005.27.177", "SUELLY VILAS BOAS"),
    (493, "004.20. 118", "ELZA GILHERME"),
    (323, "5", "MARIA JOSE CELINA PEREIRA SARDINHA"),
    (324, "5", "EDISON GIL FEREIRA DE SOUZA"),
    (325, "005.27.149", "FELICIA MARIA DA ROSA PAIVA"),
    (326, "005.27.056", "MARIA LUCIA DE SOUZA HENRIQUES"),
    (327, "001.01.040", "ZELIA LIMA RUFATO"),
    (328, "5", "MARIA PEREIRA DE GODOI MOURA"),
    (506, "004.23.138", "Luzia Antunes Bertolini"),
    (330, "5", "HELIA SILVEIRA FERREIRA"),
    (331, "001.06.206", "LILIAN EMILIA RIBEIRO VIEGAS"),
    (332, "001.06.172", "OZELINO BRAMBILLA"),
    (333, "005.27.117", "NILSON BATISTA FARIA"),
    (334, "005.27.156", "FERNANDO LUIZ DA SILVA"),
    (336, "005.27.152", "JUCILENE REIS DE SALES"),
    (337, "5", "ROBERTO RODRIGUES BONFIM"),
    (338, "005.27.109", "ELISABETH RIBEIRO"),
    (339, "005.28.164", "THIAGO JEREMIAS DA SILVA"),
    (340, "005.30.027", "JOSE CARLOS"),
    (341, "005.30.012", "ROSELI PERASSOLI"),
    (342, "005.27.154", "SEVERINA SANTOS DA SILVA"),
    (343, "005.27.180", "CARLOS ALBERTO BARTOLINI"),
    (344, "005.30.030", "FERNANDO DE SOUZA ALMEIDA"),
    (345, "005.30.30", "ELIANE BERNARDINO DE NARCES ALMEIDA"),
    (346, "005.28.63", "WAGNER DE CARVALHO GOMES"),
    (347, "005.30.038", "IRENE ALVES FEITOSA"),
    (348, "005.30.020", "CICERA MARIA DOS SANTOS DA COSTA"),
    (349, "005.30.024", "ROSANGELA DA SILVA"),
    (350, "005.30.066", "LEANDRO BARTOLOMEU COSTA"),
    (351, "005.27.176", "FLAVIA CRISTINA BELO"),
    (353, "005.30.063", "VERA LUCIA EUGENIO FERNANDES"),
    (354, "001.06.049", "SABURO MAGIMA"),
    (355, "005.30.168", "JOSE TOME DA SILVA FILHO"),
    (356, "005.27.091", "PAULO NORBERTO TANIMOTO"),
    (357, "005.30.151", "MARIA CECILIA MAGAÇO"),
    (358, "005.29.10", "PETTERSON DANIEL ALMEIDA COSTA"),
    (359, "005.30.130", "MARCOS ANTONIO FRANÇA"),
    (360, "005.30.144", "IARA BRASIL FERREIRA"),
    (361, "005.30.144", "ROSEMEIRE NASC FERREIRA CRUZ DA SILVA"),
    (362, "005.29.25", "SANDRA REGINA DE BRITO"),
    (363, "005.30.153", "JOÃO BATISTA DE OLIVEIRA NETO"),
    (364, "005.30.152", "ANDREIA APARECIDA MARCHIONI"),
    (365, "005.30.129", "BENEDITO LUIZ FONSECA NETO"),
    (366, "005.30.121", "ROSANA PEREIRA MATOS"),
    (367, "005.27.108", "SOLANGE APARECIDA STATE SOUZA"),
    (369, "005.27.028", "SIDNEY MOTA"),
    (370, "005.27.110", "SUELI BONETO MARICO"),
    (371, "005.29.13", "ISABELE GAMA DA SILVA BARRETO"),
    (372, "005.30.174", "VANESSA DOS SANTOS PROFETA"),
    (373, "005.27.003", "LUCIA ALVES PEREIRA"),
    (374, "005.27.116", "VANDA ROSAURA GIBINI"),
    (375, "005.27.136", "DORIVAL BARBIERI"),
    (376, "005.30.107", "MARCIA DIAS BERNARDES"),
    (377, "005.27.081", "ROSA LEIA NEVES"),
    (378, "005.27.081", "JORGE ANTONIO NEVES DE ALBUQUERQUE"),
    (379, "FUNCIONÁRIO", "ROZENO DE SOUZA PEREIRA"),
    (380, "005.29.16", "SANDRA LUCIA ROSAS PERES"),
    (381, "005.27.092", "SIDNEI FERREIRA DE SOUZA"),
    (382, "005.29.67", "MARCIA SORAI G. SALGADO"),
    (383, "005.27.123", "LUIZ ANTONIOLI"),
    (384, "005.30.164", "IRENE DOS PASSOS CRUZ"),
    (385, "005.29.109", "DALVA APARECIDA R DE SOUZA"),
    (386, "005.29.165", "NELSON FRANCHINI FILHO"),
    (387, "005.26.073", "MARIA GISELIA DOS SANTOS"),
    (388, "005.26.115", "LUIS TADASHI MATSUMOTO"),
    (389, "005.26.115", "ROBERTO TADASHI MATSUMOTO"),
    (390, "005.26.024", "SIRLENE SANTANA"),
    (391, "005.26.078", "MARILUCE GOMES NOBERTO"),
    (392, "005.30.163", "JANETE CARDOSO DE OLIVEIRA"),
    (393, "005.30.006", "JERONIMO MAGALHAES SILVA"),
    (394, "005.30.026", "CLAUDIA SOARES GARBO"),
    (396, "005.29.74", "ANA ALICE CARDOZO DE LIMA"),
    (397, "005.26.051", "CARMEN LUCIA DE OLIVEIRA MIRANDA"),
    (398, "FUNCIONARIA", "GISLENE APARECIDA DA SILVA"),
    (399, "005.26.111", "VALMIRA RODRIGUES"),
    (400, "004.22.096", "JOSUE TRAVES"),
    (402, "004.22.048", "ADELITA FERREIRA"),
    (403, "004.22.015", "MARIA DE FATIMA ALEXANDRE"),
    (404, "04.22.130", "JEOVA DE MORAES"),
    (405, "004.22.109", "JAIRO DOS REIS"),
    (406, "004.22.073", "JOANA EMIDIO INACIO COSTA"),
    (408, "005.26.115", "ALICE HONDA"),
    (409, "004.22.062", "ALAI PEREIRA"),
    (410, "004.22.117", "NOEMIA DOS SANTOS"),
    (411, "004.21.04", "Maria de Oliveira Marques"),
    (412, "004.22.164", "NAIR MARIA MARCIANO"),
    (413, "004.22.131", "ISABELLY LOMBARDE"),
    (414, "004.21.77", "Jose Antonio de Oliveira"),
    (415, "004.22.074", "HELENA DE CIQUEIRA"),
    (416, "004.22.044", "DAMIANA MENDES"),
    (417, "004.22.057", "CUSTODIA BATISTA"),
    (418, "004.22.126", "MARIA EVANIR"),
    (419, "004.21.161", "ELISABETE DA HORA"),
    (420, "004.22.121", "MARIA DO CARMO OLIVEIRA"),
    (421, "004.21.104", "BENIGNO MESSIAS"),
    (422, "004.21.123", "LUIS HENRIQUE Nogueira Laurito"),
    (423, "004.22.042", "CATARINA GOMES"),
    (424, "004.19.42", "MARIA DAS GRAÇAS"),
    (425, "004.22.024", "MARIA ROSA FERNANDES RODRIGUES"),
    (426, "004.21.82", "JORGE XAVIER"),
    (427, "004.19.46", "FELINTA LUCINDA"),
    (428, "004.21.46", "TERESINHA PEREIRA"),
    (429, "004.22.127", "Juvenal Messias Jr"),
    (430, "004.21.58", "GERALDO SANTANA"),
    (431, "004.19.11", "Jackson Afonso Rocha"),
    (432, "004.22.043", "JULIA SILVA"),
    (433, "004.22.135", "ISABEL CRISTINA"),
    (434, "004.22.019", "TSUNESEDE TAKMOTO"),
    (435, "004.19.35", "Edvaldo Deodato de Melo"),
    (436, "004.22.163", "TEODORICO RODRIGUES"),
    (437, "004.22.132", "MARIA ANGELIS PERES"),
    (438, "004.19.68", "ELAINE RANGEL BARRETO"),
    (439, "004.22.134", "ZILDA MARCIA RANGEL"),
    (440, "004.22.060", "ROCCO MONTANO"),
    (441, "004.22.164", "JOÃO LUIZ DOS REIS"),
    (442, "004.22.118", "JOÃO OLINO DE OLIVEIRA"),
    (443, "004.22.133", "VANESKA ROCHA"),
    (444, "004.21.14", "Mirian Bueno Correia de Almeida"),
    (445, "004.21.135", "VALDEREZ BUENO"),
    (446, "004.21.08", "CLAUDIA CRISTINA"),
    (447, "004.19.177", "MARIA MARINA DA SILVA"),
    (448, "005.26.115", "MILTON MATSUMOTO"),
    (449, "004.19.78", "CARLOS"),
    (450, "004.24.168", "IZILDA DE GOUVEIA"),
    (451, "004.23.56", "NERCY MARIA RODRIGUES"),
    (452, "004.23.54", "DARCY MARIA ARAUJO"),
    (453, "004.23.09", "LUIZ ANTONIO JORGE"),
    (454, "004.19.84", "VALDIR MORENO DE FREITAS"),
    (455, "004.22.077", "REYNALDO DE ALMEIDA"),
    (456, "004.23.19", "ODETE DA S. T. SANTOS"),
    (457, "004.23.16", "EXPEDITO S. DE OLIVEIRA"),
    (458, "004.19.87", "JOSE RICARDO DA SILVA"),
    (459, "004.19.160", "MARIA GENESIO"),
    (460, "004.23.07", "GISELE APARECIDA GILIUS"),
    (461, "004.19.78", "TEREZA DA SILVA COSTA"),
    (462, "004.24.85", "GILVANETE SALVIANO ALVES CAVALCANTE"),
    (463, "004.19.73", "PATRICIA JOSÉ DE AQUINO"),
    (464, "004.23.63", "LAURO G.DA SILVA"),
    (465, "004.19.108", "LUCIANA MINA CAPELLI"),
    (466, "004.23.05", "HELENA CONCEIÇÃO BATISTA"),
    (467, "004.23.25", "ELIANA PATENTE AVELAR GOMES DA SILVA"),
    (468, "004.23.20", "ELIANA LUIZ SOARES OLIVEIRA"),
    (469, "006.35", "GERMANO SANTOS"),
    (470, "004.23.23", "MARIA MARLI PEDROSA DA SILVA"),
    (471, "004.19", "JOÃO BENEDITO DOS SANTOS"),
    (472, "004.23.07", "LOUDES D. GILIUS"),
    (473, "004.23.74", "IZABEL CRISTINA RODRIGUES SILVA"),
    (474, "004.24.43", "FUMIKO MOTAYASHI"),
    (475, "004.24.43", "HELIO MOTAYASHI"),
    (476, "004.20. 09", "DANIELA JORDANA SOUZA"),
    (477, "004.20. 148", "EDER PEREIRE RUSSO"),
    (478, "004.20. 41", "ADELAIDE MALAQUIAS"),
    (479, "004.20. 24", "SONIA MARIA RIBEIRO"),
    (480, "004.20. 20", "MARIA INES GOMES NASCIMENTO"),
    (481, "004.20. 134", "BENEDITO CELIO MENDONÇA"),
    (482, "004.24.29", "ANTONIO JOÃO SANTOS"),
    (524, "002.07.90", "MARIA DE LOURDES C. DOS SANTOS"),
    (484, "004.23.111", "DEBORA TANIA S. MACK"),
    (485, "004.20. 27", "JUDAS TADEU LOPES"),
    (486, "004.20. 132", "JURANIR VIEIRA SOUZA"),
    (487, "004.23.77", "MARCOS S. PIRES"),
    (488, "004.20. 80", "SAMUEL DE ABREU SANTOS"),
    (489, "004.20. 134", "MARIA LUCIA SANTOS BOLITO"),
    (490, "004.20. 25", "ELIZETE DA SILVA SOUZA"),
    (491, "004.20. 148", "WADERLEY RODRIGUES"),
    (492, "004.20. 134", "REGINA CELIA DOS SANTOS MENDONÇA"),
    (776, "007.39.154", "JOAO LOPES DA SILVA"),
    (494, "004.24.37", "NAIR GONÇALVES"),
    (495, "004.24.61", "EULALIA FERREIRA"),
    (496, "005.27.173", "VIRGINIA DE GOUVEIA PÉRICO"),
    (497, "004.20. 114", "LAERCIO SILVA"),
    (498, "004.23.77", "REGINA H. P. PIRES"),
    (499, "004.20. 86", "ARLINDA BATISTA"),
    (500, "004.20. 157", "LUCIANO SIMIL DA ROCHA"),
    (501, "004.24.122", "ROSANGELA CARVALHO"),
    (502, "004.24.119", "TEREZA FUTUMI Matayoshi"),
    (503, "004.20. 126", "IRENE T. JOVANI"),
    (504, "004.20. 140", "MARIA HELENA BARBOSA S. SECCO"),
    (505, "004.20. 90", "ORLANDO PIRES GONÇALVES"),
    (31, "006.32.066", "Isac Peres Ferreira"),
    (507, "004.23.121", "WALQUIRIA APARECIDA VAZ CARDIAL"),
    (508, "004.24.174", "SUELI SRTONI"),
    (483, "004.24.122", "ALAIDE ALVARENGA"),
    (510, "004.24.79", "APARECIDA BLANCO Meira"),
    (511, "004.20. 97", "VALDOMIRO LAURINDO"),
    (512, "004.24.96", "CARMO SABINO"),
    (513, "004.20. 76", "CIRO FERREIRA SIMPLICIO"),
    (514, "004.24.176", "JOSE MARTINHO"),
    (515, "004.24.01", "MARIA DE JESUS"),
    (517, "004.20. 137", "CREUSA BERNANDO PATRIOTA"),
    (518, "004.20. 41", "EDUARDO PINTO MALAQUIAS"),
    (519, "002.07.40", "ROSA CLEIA A. DA SILVA"),
    (520, "002.07.44", "FLORIDES A. NASCIMENTO"),
    (521, "002.07.87", "MAGALI D. P. DA CRUZ"),
    (522, "002.07.087", "VALDIR SOUZA DA CRUZ"),
    (523, "002.07.016", "LUIS ANTONIO DE OLIVEIRA"),
    (565, "", "EDNA LEITE"),
    (525, "004.20. 158", "EDILEUZA FERREIRA S. SILVA"),
    (526, "004.20. 158", "HELENO PEREIRA DA SILVA"),
    (527, "002.07.136", "MERCEDES DE PAULA FLEURY"),
    (528, "002.08.107", "FRANCISCO DE ASSIS RODRIGUES"),
    (529, "002.07.41", "IRAI A. A. LOURENÇO"),
    (530, "002.07.35", "ROSELI CAVALHERI BORGES"),
    (531, "004.23.78", "MOYSES PIRES"),
    (532, "004.22.109", "JAIR MARTINS MARQUES"),
    (533, "002.07.136", "ELISO FLEURY"),
    (534, "004.23.179", "LENILSON S. DOS SANTOS"),
    (535, "002.07.020", "CLAUDIA DO N. BATISTA"),
    (536, "002.08.036", "EUNIDES MARIA DE AQUINO"),
    (537, "002.08.036", "MARIA APARECIDA ROCHA"),
    (538, "004.21.30", "KATIA FERREIRA"),
    (539, "002.07.88", "LUCIANA K. CAETANO"),
    (540, "002.08..101", "SONIA MARIAN DE SOUZA"),
    (541, "002.08.014", "GETULIO NAKASOME"),
    (542, "002.08.031", "GILBERTO D EOLIVEIRA TOSTA"),
    (543, "004.24.10", "LILIANA DEL CARMEN"),
    (544, "004.20. 37", "ANDREA DOS SANTOS MENDONÇA"),
    (545, "002.08.048", "ELIZABETH DOS SANTOS"),
    (546, "002.08.109", "SANDRA REGINA P DA SILVA"),
    (547, "004.20. 37", "JOÃO CARLOS DA SILVA"),
    (548, "2", "FATIMA APARECIDA P. NAKASOME"),
    (549, "002.07.024", "EDVAL M.DE SOUZA"),
    (550, "004.21.30", "ANDERSON LUIZ"),
    (551, "004.20. 23", "CLEIDE ALBINO"),
    (552, "004.24.111", "MARIA ALIPIO"),
    (553, "004.20. 58", "FATIMA AUXILIADORA"),
    (554, "002.08.156", "NILSON CORREA"),
    (555, "", "MARIA NEUZICE DOS SANTOS"),
    (556, "", "APARECIDA S. TALLIN"),
    (557, "", "FAUSTO MORAES"),
    (558, "", "APARECIDO O. CARVALHO FILHO"),
    (559, "", "VALMIR CASTRO"),
    (560, "", "NORA NEY ALVES SANTANA"),
    (561, "", "CELSO LUIZ BONATTI"),
    (562, "002.11.13", "SUELI A. M. YUNE"),
    (563, "", "NILSA COELHO DA SILVA"),
    (564, "", "ALMIRO DA SILVA"),
    (688, "002.11.092", "ODETE S. DA SILVA"),
    (566, "002.07.198", "EPAMINONDAS M. CASTELIANO"),
    (567, "", "CECILIA FLAUSINO"),
    (694, "002.11.139", "SEBASTIÃO VIRGULINO DA SILVA"),
    (569, "", "PEDRO VELIS"),
    (570, "", "MARIALDA VELIS"),
    (571, "", "SILVIA JERONIMO"),
    (572, "", "MARINALVA ANDRE GONÇALVES"),
    (573, "", "MARIA Helena NESPOLO"),
    (574, "004.24.56", "JUAN CARLOS MUNHOZ"),
    (575, "", "PEDRO FLAUSINO FILHO"),
    (576, "002.12.27", "JOSE NUNES"),
    (577, "03.13.18", "ANDRE G. FILHO"),
    (578, "002.11.162", "MARCIA APARECIDA SANTOS"),
    (579, "002.12.121", "EVA D SOUZA LEDO"),
    (580, "002.11.118", "ELIANA SANTOS"),
    (581, "03.13.48", "LINDALVA SOUZA BARBOSA"),
    (582, "002.12.120", "ERNANDO MONDES"),
    (583, "03.13.89", "SONIA APARECIDA B. IROMBI"),
    (584, "003.13.02", "GENY DOS SANTOS DOMINGUES"),
    (585, "002.11.109", "ELAINE SANTOS"),
    (587, "", "MARIA APARECIDA LUZ BRITO"),
    (588, "002.08.017", "LAUDELINA COSTA BATISTA"),
    (589, "002.12.112", "MAURICIO RAMALHO"),
    (590, "002.11.157", "FLAUDISIO LAVES CEDRO"),
    (591, "002.11.30", "RAIMUNDO SÁ TELES"),
    (592, "002.11.100", "VERA LUCIA COTRIM SILVA"),
    (593, "002.11.165", "DULCINEIA SORIANE"),
    (594, "004.21.89", "JAIRO ANTONIO BURIEL"),
    (595, "002.12.130", "ANANIAS BARROS"),
    (596, "002.11.44", "MARLENE O. D. RONCI"),
    (597, "002.11.157", "ISILDA CEDRO"),
    (598, "001.01", "ANDRE LUIZ RUFATO"),
    (599, "002.11.171", "IRENE COSTA"),
    (601, "002.11.125", "MARIA DO CARMO LEITE"),
    (602, "002.12.130", "MARIA APARECIDA SIMOES DA SILVA"),
    (603, "002.12.53", "GILVANETE REIS"),
    (604, "002.11.47", "SILVANA BARCELOS"),
    (605, "002.12.20", "LUCY CHAVES"),
    (765, "007.39.020", "DIOMAR R. BRUNO"),
    (607, "005.27.162", "IOLANDA ANTONIA DE OLIVEIRA"),
    (608, "002.11.161", "LAURINDO SANTOS"),
    (609, "002.11", "ELISABETH NASCIMENTO CIQUEIRA FILANTE"),
    (900, "002.09.154", "MARIA EDILIA RIBEIRO Silvestre"),
    (611, "002.11.86", "MARI FATIMA GONÇALVES"),
    (612, "03.13.47", "ELZA DE SOUZA CAETANO"),
    (613, "03.15.45", "EDVANUBIA MARIA DOS SANTOS"),
    (614, "003.17.89", "ISABEL LOPES DA SILVA"),
    (615, "003.17.73", "MARIA APARECIDA PEREIRA BARRETO"),
    (616, "03.13.13", "MARIA NEVES M. MACEDO"),
    (617, "03.15.127", "ANTONIO ROSA SILVA"),
    (618, "03.13.170", "JOSÉ INALDO"),
    (619, "002.12.16", "Isabel Casares Lanzani"),
    (620, "03.15.119", "ANISIO PEDROSSINI"),
    (621, "003.17.33", "WALTER FERRAZ VERAS"),
    (622, "03.15.90", "ALICE CAMPELO DA SILVA SANTOS"),
    (623, "004.23.75", "GERSONITA DE CAMARGO SILVA"),
    (624, "003.17.66", "LUIZA ABREU DA COSTA GABRIEL"),
    (625, "003.17.96", "REINALDO FRANCISCO DE OLIVEIRA"),
    (626, "03.13.169", "JOSÉ IRINALDO BESINA SILVA"),
    (627, "03.13.173", "ARMANDO MACHADO GUIMARÃES FILHO"),
    (628, "03.15.87", "MARIA OLIVEIRA DELGADO"),
    (629, "03.15.04", "REGINA ALVES DE OLIVEIRA"),
    (630, "03.15.90", "JOAO JOSE DOS SANTOS"),
    (631, "003.17.16", "VALDEMAR EPIFANIO FILHO"),
    (632, "03.15.25", "JULIO CESAR BARBOSA TRAMONTANO"),
    (633, "003.15.179", "CARLOS ALBERTO VILAR"),
    (634, "03.13.94", "MARIA CRISTINA PIVA DE ARAUJO"),
    (636, "003.17.56", "SEBASTIÃO LUIZ DA SILVEIRA"),
    (637, "003.17.17", "SERGIO ROBERTO LIMA DA SILVA"),
    (638, "03.15.77", "JOSEFA MARTINS SILVA"),
    (639, "003.17.39", "SERGIO GASPAR"),
    (640, "03.15.117", "ZORIE GODOY VASCONCELOS"),
    (641, "03.15.74", "MARISTELA GUIMARAES DA SILVA"),
    (642, "03.15. 141", "Lindaura Nunes Oliveira"),
    (643, "03.13.13", "CLAUDIONOR MACEDO"),
    (644, "003.17.140", "CECILIA SOARES SANTANA"),
    (645, "003.17.91", "LOURDES GASPAR BRITO"),
    (646, "03.15.64", "GERALDO MITSUMI HONDA"),
    (647, "003.17.61", "JANAINA BELO DE OLIVEIRA"),
    (648, "003.16.58", "ABADIA DAS GRAÇAS ANDUJA"),
    (649, "003.16.113", "ALMAD ALI KANBOUR"),
    (650, "003.16.143", "ANTONIO DOS SANTOS"),
    (651, "003.14.29", "ANTONIO MARCOS DA SILVA"),
    (652, "003.17.132", "AURELIO ARRUDA SANTOS"),
    (653, "003.16.120", "CARMEM LUCIA H. NASCIMENTO"),
    (654, "03.15.138", "DANIEL DE OLIVEIRA SILVA"),
    (655, "004.19.164", "DEBORA PEREIRA DE FRANÇA"),
    (656, "003.16.05", "DEUSA DE OLANDA SILVA"),
    (657, "003.14.10", "DOMINGAS PEREIRA DOS SANTOS HANSEM"),
    (658, "003.16.23", "ELIANE CRISTINA"),
    (659, "FUNCIONARIA", "ELAINE SANTOS CALDEIRA"),
    (660, "003.16.60", "ELENICE REGINA DIAS DE OLIVEIRA"),
    (661, "003.16.63", "ELIELZA ALBUQUERQUE DANTAS DE CASTRO"),
    (662, "003.14.48", "ELIZABETH MARQUES DOS SANTOS"),
    (663, "003.16.119", "ENEDINA DEOLINDO FERREIRA LIMA"),
    (664, "003.16.34", "EUGENIO TELES NETO"),
    (665, "003.16.121", "FRANCISCA DE ALMEIDA LEMOS"),
    (666, "003.14.08", "GILMAR DOS SANTOS OLIVEIRA"),
    (667, "002.11.139", "ILMA ALVES"),
    (668, "03.15.29", "IRENE BIARARI CASTELAN"),
    (669, "003.16.99", "JOAQUIM DE OLIVEIRA"),
    (670, "003.14.53", "JOSÉ CARLOS SANTANA"),
    (671, "003.16.175", "LENICE HEREDIA SALES PICERNI"),
    (672, "003.14.13", "LUIS CARLOS DA SILVA"),
    (673, "003.16.180", "LUIZ FELIPE RODRIGUES GOMES"),
    (674, "003.17.142", "MARIA APARECIDA DE ALMEIDA LIMA"),
    (675, "003.16.98", "MARIA APARECIDA DOMINGUES DOS SANTOS"),
    (676, "003.14.07", "MARIA APARECIDA SOARES OLIVEIRA"),
    (677, "003.16.102", "MARIA CONCEIÇÃO APARECIDA DAS CHAGAS LIMA"),
    (678, "003.16.104", "MARIA DA PAZ DE ALMEIDA"),
    (679, "003.17.65", "MARIA DAS GRAÇAS SILVA"),
    (680, "003.16.50", "MARIA DE LOURDES MENEZES"),
    (683, "003.16.15", "MARLENE BUENO ARAUJO"),
    (684, "004.24.24", "NAIR DOMINGOS"),
    (685, "003.14.50", "NAIR MIGUEL DE CAMARGO"),
    (686, "003.16.109", "NATALIA DA SILVA OLIVEIRA"),
    (687, "002.11.066", "NILSON CARVALHO DE OLIVEIRA"),
    (47, "006.33.041", "Lindalva Silvestre"),
    (689, "003.16.09", "REGINA APARECIDA HERNANDES"),
    (690, "003.17.115", "REGINA CECILIA FELIPE"),
    (691, "003.16.28", "ROBERTO MONETEIRO FERNANDES"),
    (692, "003.14.29", "SALETE CRISTINA DA SILVA"),
    (693, "003.16.164", "SALETE MARIA SHIOMI ROSA"),
    (240, "005.28.30", "JOAQUIM MONTEIRO DOS SANTOS"),
    (695, "03.15.29", "SILVIO COSTELAN"),
    (696, "004.20. 49", "TATIANE CRISTINA CLEMENTE OLIVEIRA"),
    (697, "003.14.01", "THEREZINHA SIQUEIRA SILVA"),
    (698, "003.16.161", "VALERIA ALVES NOVAES"),
    (699, "003.14.124", "VERA LUCIA FERREIRA CUNHA"),
    (700, "003.16.124", "ANTONIETA MARIA WENCESLAU"),
    (701, "003.14.28", "VERA LUCIA ONISHI FRANÇA"),
    (702, "003.14.59", "CARLAELI LOPES DE SOUZA"),
    (703, "003.17.95", "VALDOMIRO BARBOSA"),
    (704, "003.18.119", "ROSIMEIRE CAMPOS FREIRE"),
    (705, "003.14.92", "VANIA MARIA CAÇÃO"),
    (706, "003.18.119", "GILDO COSCARELLI"),
    (707, "003.18.107", "RITA DE CASSIA PEREIRA DA SILVA"),
    (708, "003.16.124", "RITA DE CASSIA PIRES CARDOSO"),
    (709, "003.18.108", "ALBERTO RODRIGUES DA SILVA"),
    (710, "003.16.174", "ANA MARIA DO AMARAL"),
    (711, "002.09.49", "RITA DE CASSIA BRITO"),
    (712, "003.16.56", "CLAUDETE BARBOSA CESARIO"),
    (713, "2002.09.30", "OSCAR FELIX LIMACHI RAMIRES"),
    (714, "003.18.107", "JOSE CELIO DE OLIVEIRA"),
    (715, "003.17.156", "JUDITE SAPIENZA DE MORAIS"),
    (716, "002.09.51", "MARILENE BICUDO DE BRITO"),
    (717, "003.14.148", "RENILDO PIRES DE CARVALHO"),
    (718, "004.24.24", "NEUSA DOMINGOS"),
    (719, "003.14.28", "MILTON ONISHI"),
    (720, "003.18.26", "MARIA DO CARMO LOPES"),
    (721, "003.14.184", "ODAIR DOS SANTOS"),
    (722, "003.14.82", "GERALDO APARECIDO ALBERTO"),
    (723, "003.16.97", "SERGIO SILVESTRE DOMINGUES"),
    (724, "003.14.140", "DILMA MARTINS DE JESUS"),
    (725, "003.14.147", "CRISTINA APARECIDA LIMA"),
    (726, "003.14.85", "ANTENOR JOÃO ALBERTO"),
    (727, "004.20. 97", "TEODOSIA LAURINDO"),
    (728, "003.16.16", "DAGOBERTO VERISSIMO ALEXANDRE"),
    (729, "003.16.16", "SANDRA REGINA JESUS"),
    (730, "003.18.23", "TEREZINHA BALDOINO PEREIRA"),
    (731, "003.14.181", "WALTER VASCONCELOS"),
    (732, "003.14.154", "VIRGINIA CARMELINA LIMA"),
    (733, "003.18.91", "MAURICIO JOSE ALFREDO"),
    (734, "003.18.66", "RICARDO JOAQUIM MUNIZ"),
    (735, "003.18.89", "JOSE CICERO DE ALMEIDA BARRETO"),
    (736, "002.09.51", "MARIA DE LOURDES CARDOSO B"),
    (737, "003.18.40", "VERA CRUZ P. DA SILVA"),
    (738, "007.39.062", "JOANA ALVES SILVA"),
    (739, "007.37.100", "CARLOS M. DOS SANTOS"),
    (740, "007.37.015", "WANDERLEY APARECIDA PEREIRA"),
    (741, "003.18.200", "MARILENE RICARDO DA SILVA"),
    (742, "002.07.43", "SUELI APARECIDA RODRIGUES DO COUTO"),
    (743, "003.18.287", "NEUZITA FERREIRA DA COSTA"),
    (745, "007.37.016", "JOSE ROBERTO DE PAULA"),
    (746, "007.37.94", "LUCIANO FAZIO"),
    (748, "003.18.287", "IZILDINHO FERREIRA DA COSTA"),
    (749, "007.37.030", "JOSE AFONSO MELO"),
    (750, "007.39.137", "MARIA DE LOURDES DA ROCHA"),
    (751, "007.37.080", "GILMAR DE L. FERNANDES"),
    (752, "007.37.117", "CLOVIS P. DOS DOS ANTOS"),
    (753, "007.39.096", "ROBERTO SEVERINO. DE OLIVEIRA"),
    (754, "003.18.189", "CILENE GARCIA DE SOUZA"),
    (755, "007.37.12", "MARILENE LUCIANO DOS SANTOS"),
    (756, "007.37.010", "ELIANA APARECIDA DA SILVA"),
    (757, "004.20", "MARIA DAS GRAÇAS ANDRADE MORAES"),
    (758, "003.18.193", "WALQUIRIA AUGUSTO DO NASCIMENTO"),
    (759, "007.39.134", "JOSETE LIMA MARINHA AYALA"),
    (760, "007.39.72", "CREUZA DE ALMEIDA SILVA"),
    (761, "007.39.074", "ANTONIO C. FERNANDES"),
    (762, "007.39.115", "ALTINA A. DE SOUZA"),
    (763, "007/37/129", "MARIO SEIZO HIRAI"),
    (764, "007.37.023", "CLELIA DE A. FRAGA"),
    (266, "005.25.16", "MARIA ANTONITA HENRIQUE"),
    (767, "007.37.006", "MARLENE S. DE SOUZA"),
    (769, "007.37.033", "JOSÉ A. SOARES"),
    (770, "007.37.94", "NEUSA DE OLIVEIRA FAZIO"),
    (771, "007.37.056", "EDNA DO N. FEITOSA"),
    (772, "007.37.107", "AGOSTINHA BATISTA CORREIA"),
    (773, "007.40.29", "SALETE MONTEIRO BORTOLETO"),
    (774, "007.39.118", "MAURA P. DA ROCHA"),
    (775, "007.37.033", "SILVIA A. SOARES"),
    (606, "002.12.47", "GEILSON DA SILVA"),
    (777, "007.37.101", "ELAINE A. DA SILVA"),
    (778, "007.37.107", "ANTONIO BAPTITA DE ORNELAS CORREIA"),
    (779, "007.42.56", "MARIA LUCIA MUNHOZ MUNIZ"),
    (780, "007.39.055", "MARIA APARECIDA DE FREITAS AGUIAR"),
    (781, "007.39.152", "ERMIRO VITORINO DA SILVA"),
    (782, "007.37.004", "LINDINALVA Soares da SILVA"),
    (784, "007.37.071", "LUCIANO RONALDO DORNELLES"),
    (785, "007.38.053", "ABIGAIL TODERO BERNARDES"),
    (786, "007.41.016", "SONIA REGINA RODRIGUES MARTINS"),
    (787, "007.39.026", "DIRCE GUTIERREZ GUERREIRO"),
    (788, "007.41.078", "IVANI DA SILVA FERREIRA"),
    (789, "007.31.070", "MARIANA SOUZA DOS SANTOS"),
    (790, "007.38.104", "PAULO ROBERTO COSTA"),
    (791, "007.", "KENZI ICIMOTO"),
    (792, "007.", "DJACI DE MENEZES LEITE"),
    (793, "007.41.064", "IVONE LEIKO"),
    (794, "007.38.046", "ODAIR GRATÃO"),
    (795, "007.38.047", "CUSTODIA FrRANCISCA DEJESUS PEREIRA"),
    (796, "007.41.139", "JOSE NICOLAU"),
    (798, "007.41.071", "CRISTIANE BRACAIOLI"),
    (799, "007.41.165", "ANTONIO CARLOS DE SOUZA"),
    (800, "007.41.084", "CLEON RODRIGUES COSTA"),
    (801, "007.38.011", "MARLI RIBEIRO ALVES"),
    (802, "007.39.024", "ENIO EDUARDO DA SILVA"),
    (803, "007.38.001", "JULIO CESAR GONÇALVES"),
    (804, "007.38.009", "GENESIO BETIOL"),
    (805, "007.38.048", "MARIA CRISTINA PESTANA"),
    (806, "007.38.083", "JOSE EDUARDO PESTANA"),
    (807, "007.38.087", "JOSE CARLOS SILVINO"),
    (808, "007.38.018", "LISETE APARECIDA SILVA"),
    (809, "007.39.021", "CARLOS ELIAS DIB"),
    (810, "007.38.091", "JUDITH FEDER"),
    (811, "007.41.144", "LUCIANA MARIA DE SOUZA"),
    (812, "007.42.064", "MAURICIO APARECIDO OLIVEIRA"),
    (813, "007.40.014", "ADOLFO ARRUFO NETO"),
    (814, "007.41.162", "ELVIRA DE SOUZA REIS"),
    (815, "007.42.043", "WILSON PINTO"),
    (816, "007.42.034", "DAVI VICENTE DA SILVA"),
    (818, "007.42.034", "MARIA TEREZA CASTALDI DA SILVA"),
    (819, "007.42.110", "ELZA MARIA SILVA FONTES"),
    (820, "007.42.086", "MARIA DE LOUDES MANIZ"),
    (893, "002.09.184", "MARIA BRITO DA SILVA"),
    (822, "007.42.086", "EDIMAR VIANA MARIZ"),
    (823, "007.42.185", "ANDRE PETROS ANGELIDES"),
    (824, "007.40.070", "PAULO CESAR DOS SANTOS"),
    (825, "007.42.100", "CELSO DA SILVA"),
    (826, "007.40.080", "VERA LUCIA GARCIA RICCI"),
    (827, "007.42.064", "MARIA GLORIA NASCIMENTO"),
    (828, "007.39.139", "PAULA REGINA DA COSTA CONSTANTINO"),
    (829, "007.42.181", "CLEIDE DA CONCEIÇÃO RAMIREZ"),
    (830, "007.42.016", "MARIA DO SOCORRO GOMES"),
    (832, "007.40.179", "CLAUDENICE THOMAZ BENEDITO"),
    (833, "007.40.094", "VERA LUCA DE OLIVEIRA SILVA"),
    (834, "007.42.059", "GILBERTO PEREIRA OLIVEIRA"),
    (835, "007.40.062", "OZIAS DA SILVA"),
    (836, "007.41.050", "NEIDE FRANCO DE ABREU"),
    (837, "007.40.016", "NATERCIA DE LOURDES PORTELA"),
    (838, "007.42.139", "MARLI FARIA DE SOUZA CADOSO"),
    (839, "007.40.102", "SELSO ALVES SOUTO"),
    (840, "007.42.165", "MARIO GOMES DE ORNELAS"),
    (842, "007.38.081", "DANIEL DE SOUZA TEIXEIRA"),
    (843, "007.40.051", "VICTOR NABUIK EZE"),
    (844, "007.42.023", "PAULO QUAGLIO"),
    (845, "007.42.072", "ANDREIA ROSATO DE SOUZA"),
    (846, "007.40.016", "HELMER PEREIRA DOS SANTOS"),
    (847, "007.42.065", "MARIA DE LOURDES TRINDADE GOVENAS"),
    (848, "007.42.075", "RAIMUNDO NONATO GONLAÇVES GOMES"),
    (849, "007.40.123", "NAPOLEÃO SALVADOR"),
    (850, "007.42.037", "ALICE MITIE OKUHO"),
    (851, "007.42.043", "JUVENIRA ALVES DA SILVA"),
    (852, "005.29.047", "JOÃO CARLOS DOS SANTOS"),
    (853, "005.26.008", "SONIA REGINA FERNANDES SANTOS"),
    (854, "002.09.114", "MARIA JOSÉ CARDOSO SALES"),
    (855, "005.26.016", "RICARDO ANDRÉ MAIA JUVENCIO"),
    (856, "005.26.", "JOSÉ CARLOS DE OLIVEIRA"),
    (857, "005.29.083", "ANTONIO CARLOS COSTA DOS SANTOS"),
    (858, "005.26.008", "IDALINA FERNANDES DOS SANTOS"),
    (859, "002.09.094", "IRMA NUNES LOPES"),
    (860, "002.09.132", "GILDA VETO TAMASHIRO"),
    (861, "003.14.144", "MARTA NUNES DOS SANTOS LIMA"),
    (862, "007.42.007", "ROBERTO BUSA"),
    (863, "", "ISRAEL DA COSTA SOUZA"),
    (864, "007.38.008", "GISELE RIBEIRO ALVES"),
    (865, "007.42.147", "OZEIR DA SILVA"),
    (866, "005.26.008", "LUIZ FERNANDO RODRIGUES DOS SANTOS"),
    (867, "007.42.046", "JEFERSON DOS SANTOS"),
    (868, "", "MARIA GORETE VIEIRA CARDOSO LEITE"),
    (869, "002.09.121", "ANTONIO CARLOS DOS SANTOS"),
    (870, "001.01.158", "ANA ROSA DA SILVA"),
    (871, "007.39.186", "WILSON DE ARAUJO DIDONE"),
    (872, "007.41.091", "MARIA APARECIDA SILVESTRE"),
    (873, "003.14.098", "SEVERINO PEREIRA DA SILVA JESUS"),
    (874, "005.29.134", "AILTON PAULO COBATAN"),
    (875, "002.09.095", "HELIO SANTOS SANTANA"),
    (876, "002.09.157", "SUMARA GERARDI DE OLIVEIRA"),
    (877, "002.09.173", "JOSÉ LEONEL DE CARVALHO LEITE"),
    (878, "005.26.108", "ELAINE DOS SANTOS JUVENCIO"),
    (879, "002.09.059", "JORGE FERREIRA FRANCO"),
    (880, "002.09.151", "ADRIANA SANTOS QUAGLIO"),
    (881, "002.09.146", "THEREZINHA DE JESUS STEFANI"),
    (178, "001.04.132", "Maria Mercedes S. Vicente"),
    (883, "007.40.172", "JOÃO ROCCA FILHO"),
    (884, "001.06.088", "IRINEU PEREIRA DE FREITAS"),
    (885, "007.41.054", "ISA DE JESUS MODESTO SILVA"),
    (886, "005.26.008", "PAULO ROBERTRO RODRIGUES DOS SANTOS"),
    (887, "007.42.092", "FRANCISCO CHANAS"),
    (888, "005.26.031", "LUIZ EUSEBIO GONÇALVES ROSAS"),
    (889, "001.06.088", "IRENE ANTONIO DE FREITAS"),
    (890, "007.42.145", "MARIA HELENA FONSECA CORDEIRO"),
    (891, "", "ANTONIO EUSTAQUIO RIOS"),
    (892, "007.42.148", "LIDIA ALMEIDA CENAS DOS SANTOS"),
    (184, "006.36.060", "Creusolete Ferreira Lucas"),
    (894, "005.26.168", "GILSON JULIO DA SILVA"),
    (895, "002.09.83", "HIROSE TAKATSU"),
    (896, "005.26.131", "MADALENA HISAKO HIGA"),
    (898, "005.26.134", "JUDITH ELAINE IRACI"),
    (899, "007.37.057", "PEDRO GAUGUER"),
    (610, "002.11.177", "ARISTITHELINA SILVA"),
    (901, "", "MARCELO RICARDO CORREA"),
    (902, "005.26.022", "DIVA PAES CHINAELIA"),
    (903, "005.26.079", "EDINILVA DA SILVA"),
    (904, "005.29.053", "LAUDINEIA FERNANDES"),
    (905, "007.41.091", "GENESIO ROSA FILHO"),
    (906, "005.29.053", "GILBERTO DOS SANTOS"),
    (907, "007.39.089", "ANTONIO SERGIO GIONCONDO"),
    (908, "007.39.016", "APARECIDA ALVES DE GODOI"),
    (909, "002.09.053", "MILTON LUZ"),
    (910, "FUNCIONARIA", "ANA JOSEFA DA SILVA"),
    (911, "002.09.053", "SEBASTIONA GONE DA SILVA LUZ"),
    (912, "007.42.145", "PAULO ROBERTO CORDEIRO"),
    (913, "004.19.080", "MARIA ORILENE SAMPAIO GOMES"),
    (914, "005.27.006", "VALDIRENE LOPES SANTOS LIMA"),
    (915, "FUNCIONARIA", "MARIA DA AJUDA SILVA"),
    (916, "007.37.094", "JARBAS FAZIO"),
    (917, "005.26.166", "LUCIANO DE CARVALHO"),
    (918, "005.26.027", "FABIANA CRISTINA BISPO ERMOLAN"),
    (919, "001.06.187", "MARIA APARECIDA GONÇALVES"),
    (920, "005.26.097", "WILLIAN PERUSE DOS SANTOS"),
    (921, "005.29.009", "MARIA APARECIDA RODRIGUES CLEMENTE"),
    (922, "005.26.155", "APARECIDA DOS SANTOS"),
    (924, "007.40.153", "ELPIDIO TERTO"),
    (925, "007.38.072", "FLAVIO FAUSTO"),
]

def normalize_str(s):
    """Normaliza string: uppercase, sem acentos, sem pontuação extra"""
    if not s:
        return ""
    s = s.upper().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^A-Z0-9 ]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def normalize_prontuario(p):
    """Normaliza prontuário: remove espaços, normaliza pontos"""
    if not p:
        return ""
    p = p.strip().upper()
    # Remove espaços internos
    p = re.sub(r'\s+', '', p)
    return p

def similarity(a, b):
    return SequenceMatcher(None, a, b).ratio()

def pron_to_digits(pron):
    """Remove tudo que não é dígito do prontuário"""
    return re.sub(r'[^0-9]', '', pron or '')

def pron_normalize_segments(pron):
    """
    Normaliza prontuário segmentado para comparação robusta.
    Ex: '006.31.088' e '6.31.88' -> ambos viram '006.031.088'
    Divide por . ou / e padeia cada segmento com zeros à esquerda.
    """
    if not pron:
        return ''
    pron = pron.strip()
    parts = re.split(r'[./]', pron)
    if len(parts) >= 2:
        norm_parts = [p.zfill(3) for p in parts if p.strip()]
        return '.'.join(norm_parts)
    else:
        digits = re.sub(r'[^0-9]', '', pron)
        return digits

# Padrão para extrair prontuário do rawName (está embutido no final)
# Ex: "ABADIA DAS GRACAS ANDUJA 003.16.58" -> prontuário "003.16.58"
PRON_RE = re.compile(r'(\d{2,3}[./]\d{2,3}[./]?\d{0,3}|\d{6,9})\s*$')

def extract_prontuario_from_rawname(raw):
    """Extrai o prontuário embutido no rawName"""
    if not raw:
        return ''
    m = PRON_RE.search(raw.strip())
    return m.group(1) if m else ''

def extract_name_from_rawname(raw):
    """Remove o prontuário do rawName para obter só o nome"""
    if not raw:
        return ''
    cleaned = PRON_RE.sub('', raw.strip()).strip()
    return cleaned

# Carrega dados do banco
with open('retina_apoe/staging_patients_raw.json', 'r', encoding='utf-8') as f:
    db_patients = json.load(f)

# Adiciona campo extraído ao dict de cada paciente
for p in db_patients:
    p['_extracted_pron'] = extract_prontuario_from_rawname(p.get('rawName', '') or '')
    p['_extracted_name'] = extract_name_from_rawname(p.get('rawName', '') or '')

# Prepara índices para busca rápida
# Índice por prontuário normalizado segmentado (ex: '006.031.088')
prontuario_index = {}
for p in db_patients:
    pron_raw = p['_extracted_pron']
    if pron_raw:
        pron_norm = pron_normalize_segments(pron_raw)
        if pron_norm:
            if pron_norm not in prontuario_index:
                prontuario_index[pron_norm] = []
            prontuario_index[pron_norm].append(p)

# Prepara nomes normalizados do banco para busca fuzzy (usa nome extraído)
db_names_norm = [(normalize_str(p['_extracted_name'] or p.get('normalizedName') or p.get('rawName', '')), p) for p in db_patients]

def find_best_match(lista_n, lista_pron, lista_nome):
    """
    Tenta encontrar o melhor match no banco para um paciente da lista.
    O prontuário real fica embutido no rawName do banco (ex: 'NOME 003.16.58').
    Retorna lista de candidatos com score.
    """
    lista_pron_norm = pron_normalize_segments(lista_pron)
    lista_nome_norm = normalize_str(lista_nome)

    candidates = []
    seen_ids = set()

    def add_candidate(p, match_type, name_sim, score):
        if p['id'] not in seen_ids:
            seen_ids.add(p['id'])
            candidates.append({
                'db_id': p['id'],
                'db_prontuario': p['_extracted_pron'],
                'db_name_raw': p.get('rawName', ''),
                'db_name_normalized': p.get('normalizedName', ''),
                'match_type': match_type,
                'name_similarity': round(name_sim, 3),
                'score': round(score, 3)
            })

    # 1. Match exato por prontuário normalizado
    if lista_pron_norm and lista_pron_norm in prontuario_index:
        for p in prontuario_index[lista_pron_norm]:
            db_name_norm = normalize_str(p['_extracted_name'] or p.get('rawName', ''))
            name_sim = similarity(lista_nome_norm, db_name_norm)
            add_candidate(p, 'prontuario_exato', name_sim, 0.7 + 0.3 * name_sim)

    # 1b. Match por sufixo (banco tem formato abreviado, ex '031.088' está em '006.031.088')
    if lista_pron_norm and len(lista_pron_norm) >= 7:
        for pron_n, patients in prontuario_index.items():
            if pron_n != lista_pron_norm and lista_pron_norm.endswith(pron_n):
                for p in patients:
                    db_name_norm = normalize_str(p['_extracted_name'] or p.get('rawName', ''))
                    name_sim = similarity(lista_nome_norm, db_name_norm)
                    add_candidate(p, 'prontuario_sufixo', name_sim, 0.65 + 0.35 * name_sim)

    # 2. Match fuzzy por prontuário parcial (prefixo de segmentos)
    if lista_pron_norm and len(lista_pron_norm) >= 6:
        prefix = lista_pron_norm[:7]  # ex: '006.031'
        for pron_n, patients in prontuario_index.items():
            if pron_n.startswith(prefix) and pron_n != lista_pron_norm:
                for p in patients:
                    db_name_norm = normalize_str(p['_extracted_name'] or p.get('rawName', ''))
                    name_sim = similarity(lista_nome_norm, db_name_norm)
                    pron_sim = similarity(lista_pron_norm, pron_n)
                    score = 0.4 * pron_sim + 0.6 * name_sim
                    if score > 0.4:
                        add_candidate(p, 'prontuario_parcial', name_sim, score)

    # 3. Match por nome (top 3 mais similares)
    if lista_nome_norm:
        name_scores = []
        for db_norm, p in db_names_norm:
            if not db_norm:
                continue
            sim = similarity(lista_nome_norm, db_norm)
            if sim > 0.65:
                name_scores.append((sim, p))
        name_scores.sort(key=lambda x: -x[0])
        for sim, p in name_scores[:3]:
            db_pron_norm = pron_normalize_segments(p['_extracted_pron'])
            pron_sim = similarity(lista_pron_norm, db_pron_norm) if lista_pron_norm and db_pron_norm else 0
            add_candidate(p, 'nome_fuzzy', sim, 0.2 * pron_sim + 0.8 * sim)

    # Ordena por score desc
    candidates.sort(key=lambda x: -x['score'])
    return candidates[:3]  # top 3

# Gera o CSV de cruzamento
output_rows = []

for (n, pron, nome) in MOZANIA_LIST:
    matches = find_best_match(n, pron, nome)

    if not matches:
        output_rows.append({
            'N_lista': n,
            'PRONTUARIO_lista': pron,
            'NOME_lista': nome,
            'DB_prontuario_1': 'NÃO ENCONTRADO',
            'DB_nome_raw_1': '',
            'DB_nome_normalizado_1': '',
            'match_type_1': '',
            'similaridade_nome_1': '',
            'score_1': '',
            'DB_prontuario_2': '',
            'DB_nome_raw_2': '',
            'DB_prontuario_3': '',
            'DB_nome_raw_3': '',
            'NOTAS': 'Sem match no banco'
        })
    else:
        m1 = matches[0] if len(matches) > 0 else {}
        m2 = matches[1] if len(matches) > 1 else {}
        m3 = matches[2] if len(matches) > 2 else {}

        # Define nota automática
        nota = ''
        if m1:
            if m1['match_type'] == 'prontuario_exato' and m1['name_similarity'] >= 0.85:
                nota = 'MATCH CONFIRMADO'
            elif m1['match_type'] == 'prontuario_exato' and m1['name_similarity'] >= 0.5:
                nota = 'VERIFICAR NOME'
            elif m1['match_type'] == 'prontuario_exato':
                nota = 'PRONTUÁRIO OK - NOME DIVERGENTE'
            elif m1['score'] >= 0.80:
                nota = 'MATCH PROVÁVEL'
            elif m1['score'] >= 0.65:
                nota = 'VERIFICAR MANUALMENTE'
            else:
                nota = 'MATCH INCERTO'

            # Verifica divergências entre lista e banco (compara segmentos normalizados)
            pron_lista_n = pron_normalize_segments(pron)
            pron_db_n = pron_normalize_segments(m1.get('db_prontuario', '') or '')
            # Considera match se igual ou se um é sufixo do outro (formato abreviado)
            pron_match = (pron_lista_n == pron_db_n or
                         (pron_lista_n and pron_db_n and pron_lista_n.endswith(pron_db_n)) or
                         (pron_lista_n and pron_db_n and pron_db_n.endswith(pron_lista_n)))
            if pron_lista_n and pron_db_n and not pron_match:
                nota += ' | PRONTUÁRIO DIFERENTE'

        output_rows.append({
            'N_lista': n,
            'PRONTUARIO_lista': pron,
            'NOME_lista': nome,
            'DB_prontuario_1': m1.get('db_prontuario', ''),
            'DB_nome_raw_1': m1.get('db_name_raw', ''),
            'DB_nome_normalizado_1': m1.get('db_name_normalized', ''),
            'match_type_1': m1.get('match_type', ''),
            'similaridade_nome_1': m1.get('name_similarity', ''),
            'score_1': round(m1.get('score', 0), 3) if m1 else '',
            'DB_prontuario_2': m2.get('db_prontuario', ''),
            'DB_nome_raw_2': m2.get('db_name_raw', ''),
            'DB_prontuario_3': m3.get('db_prontuario', ''),
            'DB_nome_raw_3': m3.get('db_name_raw', ''),
            'NOTAS': nota
        })

# Salva CSV
output_path = 'retina_apoe/cruzamento_mozania.csv'
fieldnames = [
    'N_lista', 'PRONTUARIO_lista', 'NOME_lista',
    'DB_prontuario_1', 'DB_nome_raw_1', 'DB_nome_normalizado_1',
    'match_type_1', 'similaridade_nome_1', 'score_1',
    'DB_prontuario_2', 'DB_nome_raw_2',
    'DB_prontuario_3', 'DB_nome_raw_3',
    'NOTAS'
]

with open(output_path, 'w', newline='', encoding='utf-8-sig') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
    writer.writeheader()
    writer.writerows(output_rows)

# Estatísticas
total = len(output_rows)
confirmados = sum(1 for r in output_rows if 'MATCH CONFIRMADO' in r['NOTAS'])
verificar = sum(1 for r in output_rows if 'VERIFICAR' in r['NOTAS'])
nao_encontrado = sum(1 for r in output_rows if 'NÃO ENCONTRADO' in str(r['DB_prontuario_1']))
divergente = sum(1 for r in output_rows if 'PRONTUÁRIO DIFERENTE' in r['NOTAS'])

print(f"CSV gerado: {output_path}")
print(f"Total de pacientes na lista: {total}")
print(f"  MATCH CONFIRMADO:   {confirmados}")
print(f"  VERIFICAR (nome/manual): {verificar}")
print(f"  PRONTUÁRIO DIFERENTE: {divergente}")
print(f"  NÃO ENCONTRADO:     {nao_encontrado}")
