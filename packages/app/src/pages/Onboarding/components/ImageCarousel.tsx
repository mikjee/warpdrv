import { Carousel, IconButton, Box, Text, Flex, Image } from '@chakra-ui/react';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { Card } from '@/components/Card';

interface ICarouselSlide {
	image?: string;
	title: string;
	description: string;
}

interface IImageCarouselProps {
	slides: ICarouselSlide[];
}

export function ImageCarousel({ slides }: IImageCarouselProps) {
	return (
		<Box>
			<Carousel.Root slideCount={slides.length} w="100%">
				<Carousel.ItemGroup>
					{slides.map((slide, index) => (
						<Carousel.Item key={index} index={index}>
							<Card bg="transparent" borderColor="rgba(255, 255, 255, 0.06)" p="0" overflow="hidden">
								{slide.image ? (
									<Image src={slide.image} alt={slide.title} w="100%" loading="lazy" />
								) : (
									<Box
										w="100%"
										h="280px"
										display="flex"
										alignItems="center"
										justifyContent="center"
										bgColor="rgba(255, 255, 255, 0.02)"
									>
										<Flex direction="column" align="center" gap="2" color="rgba(255, 255, 255, 0.15)">
											<ImageIcon size={32} />
											<Text fontSize="12px">Screenshot placeholder</Text>
										</Flex>
									</Box>
								)}
								<Box px="4" py="4" textAlign="center">
									<Text fontSize="16px" fontWeight="600" color="#e4e4e7" mb="1.5">
										{slide.title}
									</Text>
									<Text fontSize="16px" color="rgba(255, 255, 255, 0.45)" lineHeight="1.6">
										{slide.description}
									</Text>
								</Box>
							</Card>
						</Carousel.Item>
					))}
				</Carousel.ItemGroup>

				<Carousel.Control justifyContent="center" gap="4" mt="3">
					<Carousel.PrevTrigger asChild>
						<IconButton size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: 'rgba(255, 255, 255, 0.7)' }}>
							<ChevronLeft size={16} />
						</IconButton>
					</Carousel.PrevTrigger>

					<Carousel.Indicators />

					<Carousel.NextTrigger asChild>
						<IconButton size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: 'rgba(255, 255, 255, 0.7)' }}>
							<ChevronRight size={16} />
						</IconButton>
					</Carousel.NextTrigger>
				</Carousel.Control>
			</Carousel.Root>
		</Box>
	);
}
